let timer = null;
let ticker = null;
let logTarget = null;
let menuItem = null;
let moveTarget = null;

function elapsedTime() {
  return timer.elapsed + (timer.started === null ? 0 : performance.now() - timer.started);
}

function updateTimerLabel() {
  const label = document.querySelector('[data-timer-elapsed]');
  if (!timer || !label) return;
  const seconds = Math.floor(elapsedTime() / 1000);
  label.textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function clearTimer() {
  timer = null;
  clearInterval(ticker);
  ticker = null;
}

function focusTimerAction(id, key) {
  const actions = [...document.querySelectorAll(`[data-timer-for="${id}"]`)];
  actions.find((node) => node.getClientRects().length)?.querySelector(`[data-timer-action="${key}"]`)?.focus();
}

function startOrStop(id, day) {
  if (timer) {
    if (timer.id !== id || timer.day !== day) return;
    const minutes = Math.max(1, Math.round(elapsedTime() / 60000));
    clearTimer();
    renderPlan();
    openLog(id, day, minutes);
    return;
  }
  timer = { id, day, elapsed: 0, started: performance.now() };
  ticker = setInterval(updateTimerLabel, 1000);
  renderPlan();
  focusTimerAction(id, 'start');
}

function pauseOrResume(id) {
  if (timer.started === null) {
    timer.started = performance.now();
  } else {
    timer.elapsed = elapsedTime();
    timer.started = null;
  }
  renderPlan();
  focusTimerAction(id, 'pause');
}

function timerActions(id, day, completed, showLog = true) {
  const item = tasks.get(id);
  const active = timer?.id === id && timer.day === day;
  const paused = active && timer.started === null;
  const controls = create('div', '', 'timer-actions');
  controls.dataset.timerFor = id;
  if (active) {
    const elapsed = create('span', '', 'task-time elapsed');
    elapsed.dataset.timerElapsed = '';
    controls.append(elapsed);
  }
  const startName = active ? 'Stop' : 'Start';
  const start = action(active ? '■' : '▶', `${startName} timer for ${item.name}`, () => startOrStop(id, day));
  start.dataset.timerAction = 'start';
  start.disabled = completed || Boolean(timer && !active);
  const pauseName = paused ? 'Resume' : 'Pause';
  const pause = action(paused ? '▶' : 'Ⅱ', `${pauseName} timer for ${item.name}`, () => pauseOrResume(id));
  pause.dataset.timerAction = 'pause';
  pause.disabled = !active;
  controls.append(start, pause);
  if (showLog) {
    const log = action('Log', `Log session for ${item.name}`, () => openLog(id, day));
    log.disabled = completed;
    log.setAttribute('aria-haspopup', 'dialog');
    controls.append(log);
  }
  return controls;
}

function renderTimerStrip() {
  const strip = $('timer-strip');
  const show = timer && (timer.day !== date || !summary(date).plan.has(timer.id));
  strip.hidden = !show;
  strip.replaceChildren();
  if (show) {
    const { id, day } = timer;
    const selected = displayDate(day, { day: 'numeric', month: 'short' });
    strip.append(create('span', `${tasks.get(id).name} · ${selected}`, 'muted'), timerActions(id, day, false, false));
  }
  updateTimerLabel();
}

function openLog(id, day, suggested) {
  const item = tasks.get(id);
  if (item.kind === 'event' && loggedMinutes(id, day)) return;
  logTarget = { id, day };
  const label = displayDate(day, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  $('log-context').textContent = `${item.name} · ${label}`;
  $('actual-time').value = suggested ?? (item.kind === 'event' ? summary(day).plan.get(id) ?? '' : '');
  $('log-dialog').showModal();
  $('actual-time').focus();
}

$('log-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const { id, day } = logTarget;
  const item = tasks.get(id);
  const minutes = Number($('actual-time').value);
  const records = sessions.get(day) ?? [];
  sessions.set(day, [...records, { id, minutes }]);
  if (item.kind === 'event' && timer?.id === id && timer.day === day) clearTimer();
  $('log-dialog').close();
  renderPlan();
  $('announcement').textContent = `Logged ${duration(minutes)} for ${item.name}.`;
  focusPlanItem(id);
});

function focusPlanItem(id) {
  const row = document.querySelector(`[data-planned-id="${id}"]`);
  (row ?? $('calendar-open')).focus();
}

function closePlanMenu(returnFocus = false) {
  if (!menuItem) return;
  const { id } = menuItem;
  $('row-menu').hidden = true;
  menuItem = null;
  if (returnFocus) focusPlanItem(id);
}

function openPlanMenu(id, x, y) {
  const menu = $('row-menu');
  menuItem = { id, day: date };
  menu.hidden = false;
  menu.style.left = `${Math.max(0, Math.min(x, window.innerWidth - menu.offsetWidth - 4))}px`;
  menu.style.top = `${Math.max(0, Math.min(y, window.innerHeight - menu.offsetHeight - 4))}px`;
  $('reschedule-open').focus({ preventScroll: true });
}

function bindPlanMenu(row, details, id) {
  row.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    openPlanMenu(id, event.clientX, event.clientY);
  });
  details.addEventListener('keydown', (event) => {
    if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return;
    event.preventDefault();
    const bounds = details.getBoundingClientRect();
    openPlanMenu(id, bounds.left, bounds.bottom);
  });
}

document.addEventListener('pointerdown', (event) => {
  if (!$('row-menu').contains(event.target)) closePlanMenu();
});
document.addEventListener('focusin', (event) => {
  if (!$('row-menu').contains(event.target)) closePlanMenu();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && menuItem) closePlanMenu(true);
});
$('delete-row').title = 'Remove from this day’s plan';
$('delete-row').addEventListener('click', () => {
  const { id } = menuItem;
  closePlanMenu();
  removeTask(id);
});
$('reschedule-open').addEventListener('click', () => {
  moveTarget = menuItem;
  closePlanMenu(true);
  $('reschedule-context').textContent = tasks.get(moveTarget.id).name;
  const input = $('reschedule-date');
  input.value = shifted(moveTarget.day, 1);
  input.setCustomValidity('');
  $('reschedule-dialog').showModal();
  input.focus();
});
$('reschedule-date').addEventListener('input', (event) => event.target.setCustomValidity(''));
$('reschedule-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const { id, day } = moveTarget;
  const input = $('reschedule-date');
  const target = input.value;
  const destination = summary(target).plan;
  if (destination.has(id)) {
    input.setCustomValidity(day === target ? 'Choose another date.' : 'This item is already planned on that date.');
    input.reportValidity();
    return;
  }
  const source = summary(day).plan;
  destination.set(id, source.get(id));
  plans.set(target, destination);
  source.delete(id);
  $('reschedule-dialog').close();
  render();
  $('announcement').textContent = `Rescheduled ${tasks.get(id).name}.`;
  $('calendar-open').focus();
});
