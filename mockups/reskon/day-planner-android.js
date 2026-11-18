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
];
let nextId = catalog.length + 1;
const plans = new Map([
  ['2026-11-17', [{ id: 6, planned: 60 }]],
  [today, [
    { id: 1, planned: 60 }, { id: 2, planned: 45 }, { id: 3, planned: 30 },
    { id: 7, planned: 15 }, { id: 8, planned: 15 }, { id: 9, planned: 10 },
    { id: 10, planned: 10 }, { id: 11, planned: 10 }, { id: 12, planned: 5 }, { id: 13, planned: 10 },
  ]],
  ['2026-11-19', [{ id: 5, planned: 75 }, { id: 3, planned: 30 }]],
  ['2026-11-20', [{ id: 4, planned: 30 }]],
]);
const sessions = new Map([
  ['2026-11-17', new Map([[6, 45]])],
  [today, new Map([[1, 35], [2, 15]])],
]);
const capacity = new Map(['2026-11-17', today, '2026-11-19', '2026-11-20'].map((key) => [key, 240]));
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

function plannedFor(key) {
  return (plans.get(key) || []).reduce((sum, item) => sum + item.planned, 0);
}

function loggedFor(key) {
  return [...(sessions.get(key)?.values() || [])].reduce((sum, minutes) => sum + minutes, 0);
}

function availableFor(key) {
  const limit = capacity.get(key);
  if (limit == null) return '—';
  const remaining = limit - plannedFor(key);
  return remaining < 0 ? duration(-remaining) + ' over' : duration(remaining);
}

function taskRow(task, item) {
  const row = action('', 'task', () => openTask(task, item));
  row.dataset.taskId = task.id;
  const dot = element('span', task.status === 'In progress' ? 'dot progress' : 'dot');
  dot.setAttribute('aria-hidden', 'true');
  const logged = sessions.get(selected)?.get(task.id) || 0;
  const estimate = task.estimate == null ? 'no estimate' : duration(task.estimate) + ' estimated';
  row.setAttribute('aria-label', task.title + ', ' + duration(logged) + ' logged this day, ' + estimate);
  row.append(
    dot,
    element('span', 'task-name', task.title),
    element('span', 'task-ratio', duration(logged) + ' / ' + duration(task.estimate)),
  );
  return row;
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
  $('task-count').textContent = items.length + (items.length === 1 ? ' task' : ' tasks');
  $('tasks').replaceChildren(...items.map((item) => taskRow(catalog.find((task) => task.id === item.id), item)));
  if (!items.length) $('tasks').append(element('p', 'empty', 'No tasks planned for this day.'));
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

function openTask(task, item, pickerQuery) {
  const form = element('form', 'sheet-form');
  if (task) form.append(element('p', 'sheet-copy', [task.status, task.area].filter(Boolean).join(' · ')));
  else {
    const title = field('Task name', 'title', 'text', pickerQuery || '');
    title.querySelector('input').required = true;
    title.querySelector('input').maxLength = 160;
    form.append(title);
  }
  const estimate = field('Task estimate (min)', 'estimate', 'number', task?.estimate ?? '');
  const estimateInput = estimate.querySelector('input');
  estimateInput.max = '99999';
  estimateInput.placeholder = 'No estimate';
  const presets = element('div', 'estimate-presets');
  presets.setAttribute('role', 'group');
  presets.setAttribute('aria-label', 'Common estimates');
  for (const minutes of [15, 30, 45, 60, 90]) {
    const preset = action(duration(minutes), '', () => {
      estimateInput.value = minutes;
      syncPresets();
    });
    preset.dataset.minutes = minutes;
    presets.append(preset);
  }
  function syncPresets() {
    for (const preset of presets.children) {
      preset.setAttribute('aria-pressed', String(preset.dataset.minutes === estimateInput.value));
    }
  }
  estimateInput.addEventListener('input', syncPresets);
  syncPresets();
  form.append(estimate, presets);

  const dayTime = element('details', 'day-time');
  dayTime.append(element('summary', '', 'Time set aside for this day'));
  const planned = field('Planned minutes', 'planned', 'number', item?.planned ?? '');
  const plannedInput = planned.querySelector('input');
  plannedInput.placeholder = 'Use task estimate';
  plannedInput.addEventListener('invalid', () => { dayTime.open = true; });
  dayTime.append(planned);
  form.append(dayTime);
  if (item) {
    form.append(element('p', 'sheet-copy',
      duration(sessions.get(selected)?.get(task.id) || 0) + ' logged in sessions on this day.'));
  }
  const save = element('button', 'primary', item ? 'Save changes' : 'Add to plan');
  save.type = 'submit';
  form.append(save);
  if (pickerQuery !== undefined) {
    form.append(action('Back to task search', 'text-button', () => openPicker(pickerQuery)));
  }
  if (item) form.append(action('Remove from this day', 'text-button remove', () => {
    plans.set(selected, plans.get(selected).filter((entry) => entry.id !== task.id));
    sheet.close();
    render();
    $('create').focus();
    showToast('Removed from this day');
  }));
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const title = task?.title || String(data.get('title')).trim();
    if (!title) {
      form.querySelector('[name="title"]').focus();
      return;
    }
    const currentTask = task || { id: nextId++, title, area: '', status: 'To do' };
    currentTask.estimate = data.get('estimate') === '' ? null : Number(data.get('estimate'));
    if (!task) catalog.push(currentTask);
    const minutes = data.get('planned') === ''
      ? Math.min(currentTask.estimate ?? 0, 1440)
      : Number(data.get('planned'));
    if (item) item.planned = minutes;
    else plans.set(selected, [...(plans.get(selected) || []), { id: currentTask.id, planned: minutes }]);
    sheet.close();
    render();
    document.querySelector(`[data-task-id="${currentTask.id}"]`)?.focus({ preventScroll: true });
    showToast(item ? 'Plan updated' : 'Added to plan');
  });
  openSheet(task ? task.title : 'New task', form);
  form.querySelector('[name="title"], [name="estimate"]').focus();
}

function openPicker(query = '') {
  const picker = element('div', 'task-picker');
  const search = field('Search open tasks', 'query', 'search', query);
  const searchInput = search.querySelector('input');
  searchInput.placeholder = 'Search by task name';
  searchInput.maxLength = 160;
  const createTask = action('', 'primary picker-create', () => openTask(null, null, searchInput.value.trim()));
  const results = element('div');
  const resultStatus = element('p', 'sr-only');
  resultStatus.setAttribute('role', 'status');
  picker.append(search, createTask, resultStatus, results);
  const inPlan = new Set((plans.get(selected) || []).map((item) => item.id));
  function renderResults() {
    const typed = searchInput.value.trim();
    const words = typed.toLowerCase().split(/\s+/).filter(Boolean);
    const groups = typed ? ['To do', 'In progress', 'Backlog'] : ['To do', 'In progress'];
    createTask.textContent = typed ? 'Create “' + typed + '”' : 'Create new task';
    results.replaceChildren();
    let matches = 0;
    for (const group of groups) {
      const candidates = catalog.filter((task) =>
        task.status === group && !inPlan.has(task.id) &&
        words.every((word) => task.title.toLowerCase().includes(word)));
      if (typed && !candidates.length) continue;
      matches += candidates.length;
      const list = element('div', 'card');
      for (const task of candidates) {
        const row = action('', 'picker-row', () => openTask(task, null, searchInput.value));
        row.append(element('b', '', task.title), element('small', '', duration(task.estimate)));
        list.append(row);
      }
      if (!candidates.length) list.append(element('p', 'empty', 'No tasks to add.'));
      results.append(element('h3', 'sheet-section', group), list);
    }
    resultStatus.textContent = matches + (matches === 1 ? ' match' : ' matches');
    if (typed && !matches) results.append(element('p', 'empty', 'No open tasks match your search.'));
  }
  renderResults();
  searchInput.addEventListener('input', renderResults);
  openSheet('Add task', picker);
  searchInput.focus();
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
    const count = plans.get(key)?.length || 0;
    const day = action(String(i), '', () => {
      setDate(key);
      renderCalendar(key);
    });
    day.dataset.calendarFocus = key;
    day.setAttribute('aria-label', dateLabel(key) + ', ' + count + ' planned');
    if (key === selected) day.setAttribute('aria-current', 'date');
    if (count) day.append(element('em', '', count + ' task' + (count === 1 ? '' : 's')));
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
    const row = element('div', 'summary-row', catalog.find((task) => task.id === item.id).title);
    row.append(element('b', '', duration(item.planned)));
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
    } else {
      showToast(button.dataset.tab + ' is outside this mock');
    }
  });
});

render();
