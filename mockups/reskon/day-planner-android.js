const $ = (id) => document.getElementById(id);
const today = '2026-11-18';
let selected = today;
let calendarMonth = new Date(2026, 10, 1);
let toastTimeout;
const catalog = [
  { id: 1, title: 'Finish project outline', area: 'Work', status: 'In progress', estimate: 180 },
  { id: 2, title: 'Plan the week', area: 'Personal', status: 'To do', estimate: 60 },
  { id: 3, title: 'Make time for reading', area: 'Personal', status: 'In progress', estimate: 45 },
  { id: 4, title: 'Book a health check', area: 'Health', status: 'To do', estimate: 30 },
  { id: 5, title: 'Draft next sprint notes', area: 'Work', status: 'To do', estimate: 75 },
  { id: 6, title: 'Update test checklist', area: 'Work', status: 'In progress', estimate: 60 },
  { id: 7, title: 'Reply to supplier', area: 'Work', status: 'To do', estimate: 15 },
  { id: 8, title: 'Check firmware notes', area: 'Work', status: 'In progress', estimate: 30 },
  { id: 9, title: 'Send meeting recap', area: 'Work', status: 'To do', estimate: 15 },
  { id: 10, title: 'Review sample photos', area: 'Personal', status: 'To do', estimate: 20 },
  { id: 11, title: 'Sort receipts', area: 'Personal', status: 'To do', estimate: 20 },
  { id: 12, title: 'Water balcony plants', area: 'Personal', status: 'To do', estimate: 10 },
  { id: 13, title: 'Back up test results', area: 'Work', status: 'To do', estimate: 15 },
  { id: 14, title: 'Review spare parts list', area: 'Work', status: 'Backlog', estimate: 25 },
  { id: 15, title: 'Archive old test notes', area: 'Work', status: 'Done', estimate: 15 },
  { id: 16, title: 'Review delivery update', area: 'Work', status: 'Inbox', estimate: 15 },
];
let nextId = catalog.length + 1;
const plans = new Map([
  ['2026-11-17', [{ id: 6 }]],
  [today, [
    { id: 1 }, { id: 2 }, { id: 3 }, { id: 7 }, { id: 8 }, { id: 9 },
    { id: 10 }, { id: 11 }, { id: 12 }, { id: 13 },
  ]],
  ['2026-11-19', [{ id: 5 }, { id: 3 }]],
  ['2026-11-20', [{ id: 4 }]],
]);
const sessions = new Map([
  ['2026-11-17', [{ id: 6, minutes: 45 }]],
  [today, [{ id: 1, minutes: 35 }, { id: 2, minutes: 15 }]],
]);
const capacity = new Map(['2026-11-17', today, '2026-11-19', '2026-11-20'].map((key) => [key, 240]));
capacity.set(today, 480);
const notes = new Map([[today, 'Finish the outline before lunch. Leave room for reading later.']]);
const sheet = $('sheet');
const sheetContent = $('sheet-content');

function dayKey(date) {
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((num) => String(num).padStart(2, '0')).join('-');
}

function asDate(key) {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function dateLabel(key) {
  return asDate(key).toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  });
}

function duration(minutes) {
  if (minutes == null) return '—';
  if (minutes < 60) return minutes + 'm';
  const hours = Math.floor(minutes / 60) + 'h';
  return minutes % 60 ? hours + ' ' + minutes % 60 + 'm' : hours;
}

function element(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content != null) node.textContent = content;
  return node;
}

function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const use = document.createElementNS(svg.namespaceURI, 'use');
  use.setAttribute('href', '#' + name);
  svg.setAttribute('aria-hidden', 'true');
  svg.append(use);
  return svg;
}

function action(label, className, callback) {
  const button = element('button', className, label);
  button.type = 'button';
  button.addEventListener('click', callback);
  return button;
}

function setDate(key) {
  selected = key;
  render();
}

function stepDate(amount) {
  const date = asDate(selected);
  date.setDate(date.getDate() + amount);
  setDate(dayKey(date));
}

function plannedMinutes(item) {
  const entry = catalog.find(({ id }) => id === item.id);
  return entry.kind === 'event' ? item.planned : entry.estimate;
}

function plannedFor(key) {
  return (plans.get(key) || []).reduce((sum, item) => sum + (plannedMinutes(item) ?? 0), 0);
}

function loggedFor(key, id) {
  return (sessions.get(key) || []).reduce(
    (sum, entry) => id === undefined || entry.id === id ? sum + entry.minutes : sum, 0,
  );
}

function availableFor(key) {
  const limit = capacity.get(key);
  if (limit == null) return '—';
  const remaining = limit - plannedFor(key);
  return remaining < 0 ? duration(-remaining) + ' over' : duration(remaining);
}

function taskRow(task, item) {
  const isEvent = task.kind === 'event';
  const logged = loggedFor(selected, task.id);
  const ratioTarget = plannedMinutes(item);
  const row = action('', 'task', () => isEvent ? openEvent(task, item) : openTask(task, item));
  row.dataset.taskId = task.id;
  const label = isEvent ? 'Event' : 'Task';
  const target = ratioTarget == null ? 'no estimate' : duration(ratioTarget) + (isEvent ? ' planned' : ' estimated');
  const completion = isEvent && logged ? ', completed' : '';
  row.setAttribute('aria-label', label + ': ' + task.title + ', ' + duration(logged) + ' logged this day, ' + target + completion);
  const ratio = element('span', 'task-ratio', duration(logged) + ' / ' + duration(ratioTarget));
  if (isEvent && logged) ratio.append(element('span', 'event-logged', ' ✓'));
  row.append(
    element('span', isEvent ? 'entry-kind event-kind' : 'entry-kind', label),
    element('span', 'task-name', task.title),
    ratio,
  );
  const entry = withSwipeAction(row, task);
  if (!isEvent || !logged) entry.append(entryTimerControls(task, item, selected));
  return entry;
}

function planCount(items) {
  const eventCount = items.filter(({ id }) => catalog.find((entry) => entry.id === id)?.kind === 'event').length;
  const taskCount = items.length - eventCount;
  const tasks = taskCount + (taskCount === 1 ? ' task' : ' tasks');
  const events = eventCount + (eventCount === 1 ? ' event' : ' events');
  return eventCount ? (taskCount ? tasks + ' · ' + events : events) : tasks;
}

function render() {
  const date = asDate(selected);
  $('day-name').textContent = selected === today ? 'Today' :
    selected === '2026-11-17' ? 'Yesterday' :
    selected === '2026-11-19' ? 'Tomorrow' :
    date.toLocaleDateString('en-GB', { weekday: 'long' });
  $('day-date').textContent = dateLabel(selected);
  $('date').setAttribute('aria-label', 'Open calendar, ' + dateLabel(selected));
  $('planned-total').textContent = duration(plannedFor(selected));
  $('logged-total').textContent = duration(loggedFor(selected));
  $('available-total').textContent = availableFor(selected);
  $('available-total').title = capacity.has(selected) ?
    'Of ' + duration(capacity.get(selected)) + ' set aside for this day' : 'Availability not set';
  const items = plans.get(selected) || [];
  $('task-count').textContent = planCount(items);
  $('ratio-label').textContent = items.some(({ id }) => catalog.find((entry) => entry.id === id)?.kind === 'event')
    ? 'Logged / estimate or plan' : 'Logged / estimate';
  $('tasks').replaceChildren(...items.map((item) => taskRow(catalog.find((task) => task.id === item.id), item)));
  renderAwayTimer(items);
  if (!items.length) $('tasks').append(element('p', 'empty', 'Nothing planned for this day.'));
  $('day-note').textContent = notes.get(selected) || 'No note for this day.';
}

function openSheet(title, content) {
  $('sheet-title').textContent = title;
  sheetContent.replaceChildren(content);
  if (!sheet.open) sheet.showModal();
}

function showToast(message) {
  clearTimeout(toastTimeout);
  $('status').textContent = message;
  $('status').hidden = false;
  toastTimeout = setTimeout(() => { $('status').hidden = true; }, 2600);
}

function field(label, name, type, value = '') {
  const wrapper = element('label', '', label);
  const input = element('input');
  input.name = name;
  input.type = type;
  input.value = value;
  if (type === 'number') {
    input.inputMode = 'numeric';
    input.min = '0';
    input.max = '1440';
    input.step = '1';
  }
  wrapper.append(input);
  return wrapper;
}

function openNote() {
  const form = element('form', 'sheet-form');
  const label = element('label', '', 'Note for ' + dateLabel(selected));
  const input = element('textarea');
  input.rows = 4;
  input.value = notes.get(selected) || '';
  label.append(input);
  const save = element('button', 'primary', 'Save note');
  save.type = 'submit';
  form.append(label, save);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    notes.set(selected, input.value.trim());
    sheet.close();
    render();
    showToast('Day note saved');
  });
  openSheet('Day note', form);
}

function openCalendar() {
  const date = asDate(selected);
  calendarMonth = new Date(date.getFullYear(), date.getMonth(), 1);
  renderCalendar();
}

function openAvailability() {
  const form = element('form', 'sheet-form');
  const input = field('Time set aside (min)', 'capacity', 'number', capacity.get(selected) ?? '');
  const save = element('button', 'primary', 'Save availability');
  save.type = 'submit';
  form.append(
    element('p', 'sheet-copy', 'Set time aside for ' + dateLabel(selected) + '. Leave it blank to clear availability.'),
    input, save, action('Back to calendar', 'text-button', () => renderCalendar('availability')),
  );
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const value = new FormData(form).get('capacity');
    if (value === '') capacity.delete(selected);
    else capacity.set(selected, Number(value));
    render();
    renderCalendar('availability');
  });
  openSheet('Day availability', form);
  input.querySelector('input').focus();
}

function renderCalendar(focus) {
  const container = element('div');
  const header = element('div', 'section-title');
  const monthLabel = calendarMonth.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  for (const [amount, name] of [[-1, 'left'], [1, 'right']]) {
    if (amount === 1) header.append(element('strong', 'month-title', monthLabel));
    const step = action('', 'icon', () => {
      calendarMonth.setMonth(calendarMonth.getMonth() + amount);
      renderCalendar(name);
    });
    step.dataset.calendarFocus = name;
    step.setAttribute('aria-label', amount < 0 ? 'Previous month' : 'Next month');
    step.append(icon(name));
    header.append(step);
  }
  const grid = element('div', 'month-grid');
  for (const name of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']) grid.append(element('small', '', name));
  const offset = (calendarMonth.getDay() + 6) % 7;
  for (let i = 0; i < offset; i++) grid.append(element('span'));
  const year = calendarMonth.getFullYear();
  const month = calendarMonth.getMonth();
  const days = new Date(year, month + 1, 0).getDate();
  for (let i = 1; i <= days; i++) {
    const key = dayKey(new Date(year, month, i));
    const items = plans.get(key) || [];
    const day = action(String(i), '', () => {
      setDate(key);
      renderCalendar(key);
    });
    day.dataset.calendarFocus = key;
    day.setAttribute('aria-label', dateLabel(key) + ', ' + planCount(items) + ' planned');
    if (key === selected) day.setAttribute('aria-current', 'date');
    if (items.length) day.append(element('em', '', items.length + ' planned'));
    grid.append(day);
  }
  const foot = element('div', 'calendar-foot');
  foot.append(action('Jump to today', 'text-button', () => {
    setDate(today);
    const date = asDate(today);
    calendarMonth = new Date(date.getFullYear(), date.getMonth(), 1);
    renderCalendar(today);
  }), action('Open day', 'primary', () => {
    $('screen').scrollTop = 0;
    sheet.close();
  }));
  const dayName = element('h3', 'sheet-section', dateLabel(selected));
  const card = element('div', 'card');
  const items = plans.get(selected) || [];
  for (const [label, value] of [
    ['Planned', duration(plannedFor(selected))],
    ['Available', capacity.has(selected) ? availableFor(selected) : 'Not set'],
  ]) {
    const row = element('div', 'summary-row', label);
    if (label === 'Available') {
      const edit = action(capacity.has(selected) ? 'Edit availability' : 'Set availability', 'text-button', openAvailability);
      edit.dataset.calendarFocus = 'availability';
      row.append(edit);
    }
    row.append(element('b', '', value));
    card.append(row);
  }
  for (const item of items) {
    const entry = catalog.find((task) => task.id === item.id);
    const row = element('div', 'summary-row', (entry.kind === 'event' ? 'Event: ' : 'Task: ') + entry.title);
    row.append(element('b', '', duration(plannedMinutes(item))));
    card.append(row);
  }
  container.append(header, grid, foot, dayName, card);
  openSheet('Calendar', container);
  if (focus) container.querySelector('[data-calendar-focus="' + focus + '"]')?.focus();
}

$('previous').addEventListener('click', () => stepDate(-1));
$('next').addEventListener('click', () => stepDate(1));
$('date').addEventListener('click', openCalendar);
$('create').addEventListener('click', () => openPicker());
$('edit-note').addEventListener('click', openNote);
$('close').addEventListener('click', () => sheet.close());
document.querySelectorAll('[data-tab]').forEach((button) => {
  button.addEventListener('click', () => {
    if (button.dataset.tab === 'Planner') {
      setDate(today);
      $('screen').scrollTop = 0;
    } else if (button.dataset.tab === 'Sessions') {
      openSessions();
    } else {
      showToast(button.dataset.tab + ' is outside this mock');
    }
  });
});

render();
