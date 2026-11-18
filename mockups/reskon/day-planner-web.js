const $ = (id) => document.getElementById(id);
const today = '2026-11-18';
const tasks = new Map([
  ['outline', { name: 'Finish project outline', area: 'Work', estimate: 180, status: 'active' }],
  ['week', { name: 'Plan the week', area: 'Personal', estimate: 60, status: 'todo' }],
  ['reading', { name: 'Make time for reading', area: 'Personal', estimate: 45, status: 'active' }],
  ['health', { name: 'Book a health check', area: 'Health', estimate: 30, status: 'todo' }],
  ['sprint', { name: 'Draft next sprint notes', area: 'Work', estimate: 75, status: 'todo' }],
  ['checklist', { name: 'Update test checklist', area: 'Work', estimate: 60, status: 'active' }],
  ['supplier', { name: 'Reply to supplier', area: 'Work', estimate: 15, status: 'todo' }],
  ['firmware', { name: 'Check firmware notes', area: 'Work', estimate: 30, status: 'active' }],
  ['recap', { name: 'Send meeting recap', area: 'Work', estimate: 15, status: 'todo' }],
  ['photos', { name: 'Review sample photos', area: 'Personal', estimate: 20, status: 'todo' }],
  ['receipts', { name: 'Sort receipts', area: 'Personal', estimate: 20, status: 'todo' }],
  ['plants', { name: 'Water balcony plants', area: 'Personal', estimate: 10, status: 'todo' }],
  ['results', { name: 'Back up test results', area: 'Work', estimate: 15, status: 'todo' }],
]);
const plans = new Map([
  ['2026-11-17', new Map([['checklist', 60]])],
  [today, new Map([
    ['outline', 60], ['week', 45], ['reading', 30], ['supplier', 15], ['firmware', 15],
    ['recap', 10], ['photos', 10], ['receipts', 10], ['plants', 5], ['results', 10],
  ])],
  ['2026-11-19', new Map([['sprint', 75], ['reading', 30]])],
  ['2026-11-20', new Map([['health', 30]])],
]);
const sessions = new Map([
  ['2026-11-17', new Map([['checklist', 45]])],
  [today, new Map([['outline', 35], ['week', 15]])],
]);
const notes = new Map([[today, 'Finish the outline before lunch. Leave room for reading later.']]);
const capacities = new Map([...plans.keys()].map((day) => [day, 240]));
let date = today;
let month = today.slice(0, 7);
let editing = null;
let draggedTask = null;
let nextId = 1;

function create(tag, label = '', className = '') {
  const node = document.createElement(tag);
  node.textContent = label;
  if (className) node.className = className;
  return node;
}

function duration(minutes) {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (!hours) return `${remainder}m`;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

function localDate(iso) {
  return new Date(`${iso}T12:00:00Z`);
}

function shifted(iso, days) {
  const result = localDate(iso);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

function displayDate(iso, options) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', ...options }).format(localDate(iso));
}

function summary(iso) {
  const plan = plans.get(iso) ?? new Map();
  const minutes = [...plan.values()].reduce((sum, value) => sum + (value ?? 0), 0);
  const capacity = capacities.get(iso) ?? null;
  return { plan, minutes, capacity, available: capacity === null ? null : capacity - minutes };
}

function capacityText(minutes) {
  if (minutes === null) return 'No capacity set';
  return minutes < 0 ? `${duration(-minutes)} over` : `${duration(minutes)} available`;
}

function taskCount(count) {
  return `${count} ${count === 1 ? 'task' : 'tasks'}`;
}

function dayButton(iso) {
  const { plan, minutes, available } = summary(iso);
  const number = Number(iso.slice(8));
  const count = plan.size;
  const button = create('button', '', 'day-cell');
  button.type = 'button';
  button.setAttribute('aria-pressed', String(iso === date));
  const fullDate = displayDate(iso, { weekday: 'long', day: 'numeric', month: 'long' });
  button.setAttribute('aria-label', `${fullDate}${iso === today ? ' (Today)' : ''}, ${taskCount(count)}, ${duration(minutes)} planned, ${capacityText(available)}`);
  button.append(create('strong', number));
  if (count) button.append(create('small', `${taskCount(count)} · ${duration(minutes)}`));
  if (available !== null) button.append(create('small', capacityText(available)));
  button.addEventListener('click', () => {
    selectDate(iso);
    $('calendar-dialog').close();
  });
  return button;
}

function renderCalendar() {
  const first = `${month}-01`;
  const start = (localDate(first).getUTCDay() + 6) % 7;
  const grid = $('month-grid');
  $('month').textContent = displayDate(first, { month: 'long', year: 'numeric' });
  grid.replaceChildren(...['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => create('span', day, 'calendar-weekday')));
  for (let i = 0; i < start; i += 1) grid.append(create('span'));
  for (let day = first; day.startsWith(month); day = shifted(day, 1)) grid.append(dayButton(day));
}

function shiftMonth(amount) {
  const first = localDate(`${month}-01`);
  first.setUTCMonth(first.getUTCMonth() + amount);
  month = first.toISOString().slice(0, 7);
  renderCalendar();
}

function action(label, accessibleName, handler) {
  const button = create('button', label, 'button subtle row-button');
  button.type = 'button';
  button.setAttribute('aria-label', accessibleName);
  button.title = accessibleName;
  button.addEventListener('click', handler);
  return button;
}

function candidates(status, plan) {
  const items = [...tasks].filter(([id, task]) => task.status === status && !plan.has(id));
  const list = $(status);
  list.replaceChildren();
  $(`${status}-count`).textContent = items.length;
  if (!items.length) list.append(create('span', 'No available tasks', 'muted'));
  for (const [id, task] of items) {
    const row = create('div', '', 'candidate');
    const controls = create('div', '', 'row-controls');
    const grip = create('span', '⠿', 'grip');
    grip.setAttribute('aria-hidden', 'true');
    const estimate = create('span', task.estimate ? duration(task.estimate) : '—', 'task-time');
    estimate.title = task.estimate ? 'Whole task estimate' : 'No estimate';
    controls.append(grip, action('＋', `Add ${task.name} to plan`, () => addTask(id, true)));
    row.draggable = true;
    row.addEventListener('dragstart', (event) => {
      draggedTask = id;
      event.dataTransfer.setData('text/plain', id);
      event.dataTransfer.effectAllowed = 'copy';
    });
    row.addEventListener('dragend', clearDrag);
    row.append(controls, create('strong', task.name), estimate);
    list.append(row);
  }
}

function addTask(id, obeyFocus) {
  const { plan } = summary(date);
  if (plan.has(id) || !tasks.has(id)) return;
  plan.set(id, null);
  plans.set(date, plan);
  render();
  $('announcement').textContent = `Added ${tasks.get(id).name} to plan.`;
  if (obeyFocus) document.querySelector(`[data-planned-id="${id}"]`)?.focus();
}

function removeTask(id) {
  summary(date).plan.delete(id);
  render();
  $('announcement').textContent = `Removed ${tasks.get(id).name} from plan.`;
  $('new-task').focus();
}

function renderPlan() {
  const { plan, minutes, capacity, available } = summary(date);
  const logged = sessions.get(date) ?? new Map();
  const totalLogged = [...logged.values()].reduce((sum, value) => sum + value, 0);
  const totals = [
    ['Planned', duration(minutes)],
    ['Logged that day', duration(totalLogged)],
    [available !== null && available < 0 ? 'Over capacity' : 'Available', available === null ? '—' : duration(Math.abs(available))],
  ];
  $('plan-heading').textContent = date === today ? 'Today’s plan' : `${displayDate(date, { weekday: 'long' })}’s plan`;
  $('plan-count').textContent = `${taskCount(plan.size)} · ${capacity === null ? 'No capacity set' : `${duration(capacity)} capacity`}`;
  $('totals').replaceChildren(...totals.map(([label, value]) => {
    const item = create('div', '', label === 'Over capacity' ? 'total over' : 'total');
    item.append(create('dt', label), create('dd', value));
    return item;
  }));
  $('capacity-track').hidden = capacity === null;
  $('capacity-bar').style.width = `${Math.min(100, capacity ? 100 * minutes / capacity : minutes ? 100 : 0)}%`;
  $('planned').replaceChildren();
  for (const id of plan.keys()) {
    const task = tasks.get(id);
    const time = duration(logged.get(id) ?? 0);
    const estimate = task.estimate ? duration(task.estimate) : '—';
    const row = create('li');
    const button = create('button', '', 'planned-row');
    button.type = 'button';
    button.dataset.plannedId = id;
    button.setAttribute('aria-label', `Edit planned time for ${task.name}. ${time} logged this day / ${task.estimate ? `${estimate} estimated` : 'no estimate'}`);
    button.addEventListener('click', () => openTask(id));
    button.append(create('strong', task.name, 'task-name'), create('span', `${time} / ${estimate}`, 'task-time'));
    row.append(button);
    $('planned').append(row);
  }
  candidates('todo', plan);
  candidates('active', plan);
}

function render() {
  $('date-text').textContent = displayDate(date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  $('today').disabled = date === today;
  $('notes').value = notes.get(date) ?? '';
  renderPlan();
}

function selectDate(iso) {
  date = iso;
  render();
}

function openTask(id = null) {
  editing = id;
  const task = tasks.get(id);
  $('task-dialog-heading').textContent = task ? 'Edit planned task' : 'New task';
  $('task-name').value = task?.name ?? '';
  $('task-name').setCustomValidity('');
  $('task-name').readOnly = Boolean(task);
  $('estimate').value = task?.estimate ?? '';
  $('planned-time').value = summary(date).plan.get(id) ?? '';
  $('task-logged').hidden = !task;
  $('task-logged').textContent = `Logged this day: ${duration(sessions.get(date)?.get(id) ?? 0)}`;
  $('remove-task').hidden = !task;
  $('task-form').querySelector('.primary').textContent = task ? 'Save' : 'Add to plan';
  $('task-dialog').showModal();
  $(task ? 'planned-time' : 'task-name').focus();
}

$('task-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const name = $('task-name').value.trim();
  if (!name) {
    $('task-name').setCustomValidity('Enter a task name.');
    $('task-name').reportValidity();
    return;
  }
  const id = editing ?? `new-${nextId++}`;
  const task = tasks.get(id) ?? { name, area: 'Personal', status: 'todo' };
  task.estimate = Number($('estimate').value) || null;
  tasks.set(id, task);
  const { plan } = summary(date);
  plan.set(id, Number($('planned-time').value) || null);
  plans.set(date, plan);
  $('task-dialog').close();
  render();
  document.querySelector(`[data-planned-id="${id}"]`)?.focus();
});
$('task-name').addEventListener('input', () => $('task-name').setCustomValidity(''));
$('remove-task').addEventListener('click', () => {
  $('task-dialog').close();
  removeTask(editing);
});
$('new-task').addEventListener('click', () => openTask());
$('notes').addEventListener('input', (event) => notes.set(date, event.target.value));
$('previous').addEventListener('click', () => selectDate(shifted(date, -1)));
$('next').addEventListener('click', () => selectDate(shifted(date, 1)));
$('today').addEventListener('click', () => {
  selectDate(today);
  $('calendar-open').focus();
});
$('calendar-open').addEventListener('click', () => {
  month = date.slice(0, 7);
  renderCalendar();
  $('calendar-dialog').showModal();
});
$('previous-month').addEventListener('click', () => shiftMonth(-1));
$('next-month').addEventListener('click', () => shiftMonth(1));
$('capacity-open').addEventListener('click', () => {
  $('capacity').value = summary(date).capacity ?? '';
  $('capacity-dialog').showModal();
});
$('capacity-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const value = $('capacity').value;
  if (value === '') capacities.delete(date);
  else capacities.set(date, Number(value));
  $('capacity-dialog').close();
  render();
});
for (const close of document.querySelectorAll('[data-close]')) {
  close.addEventListener('click', () => close.closest('dialog').close());
}
const dropSurface = document.querySelector('.plan');
function clearDrag() {
  draggedTask = null;
  dropSurface.classList.remove('over-target');
}
dropSurface.addEventListener('dragover', (event) => {
  if (!draggedTask) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'copy';
  dropSurface.classList.add('over-target');
});
dropSurface.addEventListener('dragleave', (event) => {
  if (!dropSurface.contains(event.relatedTarget)) dropSurface.classList.remove('over-target');
});
dropSurface.addEventListener('drop', (event) => {
  if (!draggedTask) return;
  event.preventDefault();
  addTask(draggedTask, false);
  clearDrag();
});

render();
