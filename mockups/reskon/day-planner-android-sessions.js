function focusPlanEntry(id) {
  document.querySelector(`[data-task-id="${id}"]`)?.focus({ preventScroll: true });
}

function removePlanEntry(id) {
  plans.set(selected, (plans.get(selected) || []).filter((entry) => entry.id !== id));
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
    form.append(action('More actions', 'text-button', () => openPlanActions(eventEntry)));
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

function openLogSession(entry, initialMinutes, date = selected) {
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
    if (entry.kind === 'event') stopTimerForEvent(entry.id, date);
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
  const feedback = element('span', 'plan-gesture-feedback', 'Log session');
  feedback.setAttribute('aria-hidden', 'true');
  wrapper.append(feedback, row);

  const swipeDistance = 56;
  const holdMs = 500;
  const canLog = entry.kind !== 'event' || !loggedFor(selected, entry.id);
  let gesture;
  let hold;
  let suppressClick = false;

  function resetGesture() {
    clearTimeout(hold);
    gesture = undefined;
    wrapper.classList.remove('plan-swiping', 'plan-swipe-ready');
    wrapper.style.removeProperty('--plan-swipe-x');
  }

  function openActions() {
    resetGesture();
    suppressClick = true;
    if (row.isConnected && !sheet.open) openPlanActions(entry);
  }

  row.addEventListener('pointerdown', (event) => {
    if (!event.isPrimary || event.button !== 0) return;
    resetGesture();
    gesture = { id: event.pointerId, x: event.clientX, y: event.clientY };
    suppressClick = false;
    row.setPointerCapture(event.pointerId);
    hold = setTimeout(openActions, holdMs);
  });
  row.addEventListener('pointermove', (event) => {
    if (gesture?.id !== event.pointerId) return;
    const x = event.clientX - gesture.x;
    const y = event.clientY - gesture.y;
    if (Math.hypot(x, y) <= 10 && gesture.axis === undefined) return;
    clearTimeout(hold);
    suppressClick = true;
    if (gesture.axis === undefined) gesture.axis = Math.abs(x) > Math.abs(y) * 1.25 ? 'horizontal' : 'vertical';
    if (gesture.axis !== 'horizontal' || !canLog) return;
    wrapper.classList.add('plan-swiping');
    wrapper.classList.toggle('plan-swipe-ready', Math.abs(x) >= swipeDistance);
    wrapper.dataset.swipeDirection = x > 0 ? 'right' : 'left';
    wrapper.style.setProperty('--plan-swipe-x', Math.max(-96, Math.min(96, x)) + 'px');
  });
  row.addEventListener('pointercancel', resetGesture);
  row.addEventListener('lostpointercapture', resetGesture);
  row.addEventListener('pointerup', (event) => {
    if (gesture?.id !== event.pointerId) return;
    const x = Math.abs(event.clientX - gesture.x);
    const y = Math.abs(event.clientY - gesture.y);
    const shouldLog = canLog && gesture.axis !== 'vertical' && x >= swipeDistance && x > y * 1.25;
    resetGesture();
    if (!shouldLog) return;
    suppressClick = true;
    const planned = plans.get(selected)?.find(({ id }) => id === entry.id)?.planned;
    openLogSession(entry, entry.kind === 'event' ? planned : undefined);
  });
  row.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    openActions();
  });
  row.addEventListener('keydown', (event) => {
    if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return;
    event.preventDefault();
    openActions();
  });
  row.addEventListener('click', (event) => {
    if (!suppressClick || event.detail === 0) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    suppressClick = false;
  }, true);
  return wrapper;
}

function openPlanActions(entry) {
  const content = element('div', 'plan-context-actions');
  content.append(
    element('p', 'sheet-copy', entry.title),
    action('Reschedule', 'text-button', () => openReschedule(entry)),
    action('Delete from plan', 'text-button remove', () => removePlanEntry(entry.id)),
  );
  openSheet('Plan actions', content);
  content.querySelector('button').focus();
}

function openReschedule(entry) {
  const source = selected;
  const tomorrow = asDate(source);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const form = element('form', 'sheet-form');
  const date = field('New date', 'date', 'date', dayKey(tomorrow));
  const input = date.querySelector('input');
  input.required = true;
  const error = element('p', 'form-error');
  error.setAttribute('role', 'status');
  const move = element('button', 'primary', 'Move to date');
  move.type = 'submit';
  form.append(element('p', 'sheet-copy', entry.title), date, error, move,
    action('Back to plan actions', 'text-button', () => openPlanActions(entry)));
  input.addEventListener('change', () => { error.textContent = ''; });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const target = input.value;
    if (target === source) {
      error.textContent = 'Choose a different date.';
      return;
    }
    const targetItems = plans.get(target) || [];
    if (targetItems.some(({ id }) => id === entry.id)) {
      error.textContent = 'This is already on the plan for that day.';
      return;
    }
    const sourceItems = plans.get(source) || [];
    const item = sourceItems.find(({ id }) => id === entry.id);
    if (!item) return;
    plans.set(source, sourceItems.filter(({ id }) => id !== entry.id));
    plans.set(target, [...targetItems, item]);
    sheet.close();
    render();
    $('create').focus();
    showToast('Moved to ' + dateLabel(target));
  });
  openSheet('Reschedule', form);
  input.focus();
}
