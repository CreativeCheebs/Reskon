let activeTimer;
let timerInterval;

function elapsedMillis() {
  return activeTimer.elapsed + (activeTimer.started === null ? 0 : performance.now() - activeTimer.started);
}

function elapsedText() {
  const seconds = Math.floor(elapsedMillis() / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds / 60) % 60;
  const tail = String(seconds % 60).padStart(2, '0');
  if (!hours) return minutes + ':' + tail;
  return hours + ':' + String(minutes).padStart(2, '0') + ':' + tail;
}

function updateTimerReadouts() {
  if (!activeTimer) return;
  document.querySelectorAll('.timer-elapsed').forEach((output) => { output.textContent = elapsedText(); });
}

function startPlannerTimer(entry, date) {
  if (activeTimer) return;
  activeTimer = { entry, date, elapsed: 0, started: performance.now() };
  timerInterval = setInterval(updateTimerReadouts, 250);
  render();
  focusTimerControl(entry.id, 'pause');
}

function clearPlannerTimer() {
  clearInterval(timerInterval);
  activeTimer = undefined;
}

function stopTimerForEvent(id, date) {
  if (activeTimer?.entry.id === id && activeTimer.date === date) clearPlannerTimer();
}

function stopPlannerTimer() {
  const { entry, date } = activeTimer;
  const minutes = Math.max(1, Math.round(elapsedMillis() / 60000));
  clearPlannerTimer();
  render();
  focusTimerControl(entry.id, 'start');
  openLogSession(entry, minutes, date);
}

function toggleTimerPause() {
  if (activeTimer.started === null) {
    activeTimer.started = performance.now();
  } else {
    activeTimer.elapsed = elapsedMillis();
    activeTimer.started = null;
  }
  const id = activeTimer.entry.id;
  render();
  focusTimerControl(id, 'pause');
}

function focusTimerControl(id, kind) {
  document.querySelector(`[data-timer-id="${id}"][data-control="${kind}"]`)?.focus({ preventScroll: true });
}

function timerButton(entry, name, glyph, control, callback) {
  const button = action('', 'timer-button', callback);
  button.dataset.timerId = entry.id;
  button.dataset.control = control;
  button.setAttribute('aria-label', name + ' for ' + entry.title);
  button.title = name;
  button.append(icon(glyph));
  return button;
}

function entryTimerControls(entry, item, date, away = false) {
  const controls = element('div', 'timer-controls');
  controls.setAttribute('role', 'group');
  controls.setAttribute('aria-label', 'Session controls for ' + entry.title);
  const current = activeTimer?.entry.id === entry.id && activeTimer.date === date;
  if (current) {
    const readout = element('span', 'timer-elapsed', elapsedText());
    readout.setAttribute('aria-label', activeTimer.started === null ? 'Elapsed time, paused' : 'Elapsed time');
    const pause = activeTimer.started === null ? 'Resume timer' : 'Pause timer';
    controls.append(
      readout,
      timerButton(entry, 'Stop timer', 'stop', 'stop', stopPlannerTimer),
      timerButton(entry, pause, activeTimer.started === null ? 'play' : 'pause', 'pause', toggleTimerPause),
    );
  } else {
    const start = timerButton(entry, 'Start timer', 'play', 'start', () => startPlannerTimer(entry, date));
    start.disabled = Boolean(activeTimer);
    controls.append(start);
  }
  if (!away) {
    controls.append(timerButton(entry, 'Log session', 'log', 'log', () =>
      openLogSession(entry, entry.kind === 'event' ? item.planned : undefined, date)));
  }
  return controls;
}

function renderAwayTimer(items) {
  const strip = $('active-timer');
  strip.replaceChildren();
  strip.hidden = !activeTimer || (
    activeTimer.date === selected && items.some(({ id }) => id === activeTimer.entry.id)
  );
  if (strip.hidden) return;
  const { entry, date } = activeTimer;
  const jump = action(entry.title, 'timer-jump', () => setDate(date));
  jump.title = 'Open timer day: ' + dateLabel(date);
  strip.append(jump, entryTimerControls(entry, null, date, true));
}
