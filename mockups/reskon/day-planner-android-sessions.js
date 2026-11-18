function focusPlanEntry(id) {
  document.querySelector(`[data-task-id="${id}"]`)?.focus({ preventScroll: true });
}

function removePlanEntry(id) {
  plans.set(selected, plans.get(selected).filter((entry) => entry.id !== id));
  sheet.close();
  render();
  $('create').focus();
  showToast('Removed from this day');
}

function openEvent(eventEntry, item, query = '') {
  const form = element('form', 'sheet-form');
  const name = field('Event name', 'title', 'text', eventEntry?.title ?? query);
  const input = name.querySelector('input');
  input.required = true;
  input.maxLength = 160;
  input.addEventListener('input', () => input.setCustomValidity(''));
  const planned = createDurationPicker('Planned duration', item?.planned ?? 30);
  const logged = eventEntry ? loggedFor(selected, eventEntry.id) : 0;
  const copy = logged ? duration(logged) + ' logged in Sessions.' :
    'Reserve time now. Log the session when the event happens.';
  const save = element('button', 'primary', item ? 'Save changes' : 'Add event');
  save.type = 'submit';
  form.append(element('p', 'sheet-copy', copy), name, planned.element, save);

  if (item) {
    if (!logged) form.append(action('Log session', 'text-button', () => openLogSession(eventEntry, item.planned)));
    form.append(action('Remove from this day', 'text-button remove', () => removePlanEntry(eventEntry.id)));
  } else {
    form.append(action('Back to task search', 'text-button', () => openPicker(query)));
  }
  const error = element('p', 'form-error');
  error.setAttribute('role', 'status');
  form.append(error);
  form.addEventListener('submit', (submission) => {
    submission.preventDefault();
    const title = input.value.trim();
    if (!title) {
      input.setCustomValidity('Enter an event name.');
      input.reportValidity();
      return;
    }
    if (!planned.value) {
      error.textContent = 'Choose a planned duration greater than zero.';
      return;
    }
    const entry = eventEntry || { id: nextId++, kind: 'event' };
    entry.title = title;
    if (item) item.planned = planned.value;
    else {
      catalog.push(entry);
      plans.set(selected, [...(plans.get(selected) || []), { id: entry.id, planned: planned.value }]);
    }
    sheet.close();
    render();
    focusPlanEntry(entry.id);
    showToast(item ? 'Event updated' : 'Event added to plan');
  });
  openSheet(item ? 'Edit event' : 'Add event', form);
  input.focus();
}

function openLogSession(entry, initialMinutes) {
  const date = selected;
  const form = element('form', 'sheet-form');
  const actual = field('Actual duration (min)', 'actual', 'number', initialMinutes ?? '');
  const input = actual.querySelector('input');
  input.min = '1';
  input.required = true;
  const save = element('button', 'primary', 'Save session');
  save.type = 'submit';
  const kind = entry.kind === 'event' ? 'Event' : 'Task';
  form.append(element('p', 'sheet-copy', kind + ': ' + entry.title + ' · ' + dateLabel(date)), actual, save);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (entry.kind === 'event' && loggedFor(date, entry.id)) return;
    sessions.set(date, [...(sessions.get(date) || []), { id: entry.id, minutes: Number(input.value) }]);
    sheet.close();
    render();
    focusPlanEntry(entry.id);
    showToast('Session logged');
  });
  openSheet('Log session', form);
  input.focus();
}

function openSessions() {
  const list = element('div', 'card');
  for (const entry of [...(sessions.get(selected) || [])].reverse()) {
    const task = catalog.find(({ id }) => id === entry.id);
    const row = element('div', 'summary-row', (task.kind === 'event' ? 'Event: ' : 'Task: ') + task.title);
    row.append(element('b', '', duration(entry.minutes)));
    list.append(row);
  }
  if (!list.children.length) list.append(element('p', 'empty', 'No sessions logged for this day.'));
  const content = element('div');
  content.append(element('p', 'sheet-copy', dateLabel(selected) + ' · ' + duration(loggedFor(selected)) + ' logged'), list);
  openSheet('Sessions', content);
}

function withSwipeAction(row, entry) {
  const wrapper = element('div', 'plan-entry');
  wrapper.append(row);
  if (!entry) return wrapper;

  function logEntry() {
    setRevealed(false);
    const planned = plans.get(selected)?.find(({ id }) => id === entry.id)?.planned;
    openLogSession(entry, entry.kind === 'event' ? planned : undefined);
  }
  const log = action('Log session', 'swipe-action', logEntry);
  log.setAttribute('aria-label', 'Log session for ' + entry.title);
  wrapper.prepend(log);
  let tapStart;
  log.addEventListener('touchstart', (event) => {
    tapStart = event.touches.length === 1 ? event.touches[0] : null;
  }, { passive: true });
  log.addEventListener('touchend', (event) => {
    const end = event.changedTouches[0];
    if (!tapStart || Math.hypot(end.clientX - tapStart.clientX, end.clientY - tapStart.clientY) > 12) return;
    event.preventDefault();
    logEntry();
  }, { passive: false });
  function setRevealed(revealed) {
    wrapper.classList.toggle('revealed', revealed);
    log.hidden = !revealed;
  }
  setRevealed(false);

  let start;
  let suppressClick = false;
  row.addEventListener('pointerdown', (event) => {
    if (!event.isPrimary || event.button !== 0) return;
    start = { id: event.pointerId, x: event.clientX, y: event.clientY };
    suppressClick = false;
    row.setPointerCapture(event.pointerId);
  });
  row.addEventListener('pointercancel', () => { start = undefined; });
  row.addEventListener('pointerup', (event) => {
    if (start?.id !== event.pointerId) return;
    const x = event.clientX - start.x;
    const y = event.clientY - start.y;
    start = undefined;
    if (Math.abs(x) < 35 || Math.abs(x) <= Math.abs(y) * 1.25) return;
    suppressClick = true;
    setRevealed(x < 0);
  });
  row.addEventListener('click', (event) => {
    if (!suppressClick || event.detail === 0) return;
    event.stopImmediatePropagation();
    suppressClick = false;
  }, true);
  return wrapper;
}
