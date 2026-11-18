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
  ['delivery', { name: 'Review delivery update', area: 'Work', estimate: 15, status: 'inbox' }],
]);
const taskPlan = (...ids) => new Map(ids.map((id) => [id, null]));
const plans = new Map([
  ['2026-11-17', taskPlan('checklist')],
  [today, taskPlan('outline', 'week', 'reading', 'supplier', 'firmware', 'recap', 'photos', 'receipts', 'plants', 'results')],
  ['2026-11-19', taskPlan('sprint', 'reading')],
  ['2026-11-20', taskPlan('health')],
]);
const sessions = new Map([
  ['2026-11-17', [{ id: 'checklist', minutes: 45 }]],
  [today, [{ id: 'outline', minutes: 35 }, { id: 'week', minutes: 15 }]],
]);
const notes = new Map([[today, 'Finish the outline before lunch. Leave room for reading later.']]);
const capacities = new Map([...plans.keys()].map((day) => [day, 240]));
capacities.set(today, 480);
let date = today;
let month = today.slice(0, 7);
let editing = null;
let draftKind = 'task';
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
  const minutes = [...plan].reduce((sum, [id, planned]) => sum + (plannedMinutes(id, planned) ?? 0), 0);
  const capacity = capacities.get(iso) ?? null;
  return { plan, minutes, capacity, available: capacity === null ? null : capacity - minutes };
}

function plannedMinutes(id, eventMinutes) {
  const item = tasks.get(id);
  return item.kind === 'event' ? eventMinutes : item.estimate;
}

function capacityText(minutes) {
  if (minutes === null) return 'No capacity set';
  return minutes < 0 ? `${duration(-minutes)} over` : `${duration(minutes)} available`;
}

function planCount(plan) {
  const events = [...plan.keys()].filter((id) => tasks.get(id).kind === 'event').length;
  const work = plan.size - events;
  const taskText = `${work} ${work === 1 ? 'task' : 'tasks'}`;
  const eventText = `${events} ${events === 1 ? 'event' : 'events'}`;
  return events ? [work ? taskText : '', eventText].filter(Boolean).join(', ') : taskText;
}

function kindLabel(kind) {
  return kind === 'event' ? 'Event' : 'Task';
}

function itemName(item) {
  const name = create('span', '', 'item-name');
  const kind = create('span', kindLabel(item.kind), item.kind === 'event' ? 'item-kind event' : 'item-kind');
  name.append(kind, create('strong', item.name, 'task-name'));
  return name;
}

function loggedMinutes(id, day = date) {
  const records = sessions.get(day) ?? [];
  return records.reduce((total, record) => total + (id === undefined || record.id === id ? record.minutes : 0), 0);
}

function dayButton(iso) {
  const { plan, minutes, available } = summary(iso);
  const number = Number(iso.slice(8));
  const button = create('button', '', 'day-cell');
  button.type = 'button';
  button.setAttribute('aria-pressed', String(iso === date));
  const fullDate = displayDate(iso, { weekday: 'long', day: 'numeric', month: 'long' });
  button.setAttribute('aria-label', `${fullDate}${iso === today ? ' (Today)' : ''}, ${planCount(plan)}, ${duration(minutes)} planned, ${capacityText(available)}`);
  button.append(create('strong', number));
  if (plan.size) button.append(create('small', `${planCount(plan)} · ${duration(minutes)}`));
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
      draggedTask = { id, source: 'available' };
      event.dataTransfer.setData('text/plain', id);
      event.dataTransfer.effectAllowed = 'copy';
    });
    row.addEventListener('dragend', clearDrag);
    row.append(controls, itemName(task), estimate);
    list.append(row);
  }
}

function addTask(id, obeyFocus) {
  const { plan } = summary(date);
  if (plan.has(id) || !tasks.has(id)) return;
  const task = tasks.get(id);
  if (task.status === 'inbox') task.status = 'todo';
  plan.set(id, null);
  plans.set(date, plan);
  render();
  $('announcement').textContent = `Added ${task.name} to plan.`;
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
  const totals = [
    ['Planned', duration(minutes)],
    ['Logged that day', duration(loggedMinutes())],
    [available !== null && available < 0 ? 'Over capacity' : 'Available', available === null ? '—' : duration(Math.abs(available))],
  ];
  $('plan-heading').textContent = date === today ? 'Today’s plan' : `${displayDate(date, { weekday: 'long' })}’s plan`;
  $('plan-count').textContent = `${planCount(plan)} · ${capacity === null ? 'No capacity set' : `${duration(capacity)} capacity`}`;
  $('totals').replaceChildren(...totals.map(([label, value]) => {
    const item = create('div', '', label === 'Over capacity' ? 'total over' : 'total');
    item.append(create('dt', label), create('dd', value));
    return item;
  }));
  $('planned').replaceChildren();
  for (const [id, planned] of plan) {
    const task = tasks.get(id);
    const logged = loggedMinutes(id);
    const time = duration(logged);
    const event = task.kind === 'event';
    const estimateMinutes = plannedMinutes(id, planned);
    const estimate = estimateMinutes ? duration(estimateMinutes) : '—';
    const estimateLabel = estimateMinutes ? `${estimate} ${event ? 'planned' : 'estimated'}` : 'no estimate';
    const row = create('li', '', 'plan-item');
    const button = create('button', '', 'planned-row');
    button.type = 'button';
    button.dataset.plannedId = id;
    button.setAttribute('aria-keyshortcuts', 'Shift+F10');
    const completion = event && logged ? ', completed' : '';
    button.setAttribute('aria-label', `${kindLabel(task.kind)}: ${task.name}. ${time} logged this day / ${estimateLabel}${completion}`);
    button.addEventListener('click', () => openTask(id));
    if (!event) {
      button.draggable = true;
      button.addEventListener('dragstart', (dragEvent) => {
        draggedTask = { id, source: 'plan', date };
        dragEvent.dataTransfer.setData('text/plain', id);
        dragEvent.dataTransfer.effectAllowed = 'move';
      });
      button.addEventListener('dragend', clearDrag);
    }
    const ratio = create('span', `${time} / ${estimate}`, 'task-time');
    if (event && logged) ratio.append(create('span', ' ✓', 'event-logged'));
    button.append(itemName(task), ratio);
    row.append(button, timerActions(id, date, event && Boolean(logged)));
    bindPlanMenu(row, button, id);
    $('planned').append(row);
  }
  candidates('inbox', plan);
  candidates('todo', plan);
  candidates('active', plan);
  renderTimerStrip();
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

function openTask(id = null, kind = 'task') {
  editing = id;
  const task = tasks.get(id);
  draftKind = task ? task.kind ?? 'task' : kind;
  const event = draftKind === 'event';
  $('task-dialog-heading').textContent = `${task ? 'Edit planned' : 'New'} ${draftKind}`;
  $('name-label').textContent = `${kindLabel(draftKind)} name`;
  $('task-name').placeholder = event ? 'e.g. Nap' : 'What do you want to work on?';
  $('task-name').value = task?.name ?? '';
  $('task-name').setCustomValidity('');
  $('task-name').readOnly = Boolean(task);
  $('estimate-field').hidden = event;
  $('estimate').disabled = event;
  $('estimate').value = task?.estimate ?? '';
  $('planned-field').hidden = !event;
  $('planned-time').disabled = !event;
  $('planned-time').required = event;
  $('planned-time').value = summary(date).plan.get(id) ?? '';
  $('task-logging').hidden = !task;
  const logged = task ? loggedMinutes(id) : 0;
  $('task-logged').textContent = event && !logged
    ? 'Log the session when the event happens.'
    : `Logged this day: ${duration(logged)}`;
  $('task-form').querySelector('.primary').textContent = task ? 'Save' : 'Add to plan';
  $('task-dialog').showModal();
  $(task ? (event ? 'planned-time' : 'estimate') : 'task-name').focus();
}

$('task-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const name = $('task-name').value.trim();
  if (!name) {
    $('task-name').setCustomValidity(`Enter the ${draftKind} name.`);
    $('task-name').reportValidity();
    return;
  }
  const id = editing ?? `new-${nextId++}`;
  const task = tasks.get(id) ?? { name, kind: draftKind, status: draftKind === 'task' ? 'todo' : null };
  task.estimate = Number($('estimate').value) || null;
  tasks.set(id, task);
  const { plan } = summary(date);
  plan.set(id, draftKind === 'event' ? Number($('planned-time').value) : null);
  plans.set(date, plan);
  $('task-dialog').close();
  render();
  document.querySelector(`[data-planned-id="${id}"]`)?.focus();
});
$('task-name').addEventListener('input', () => $('task-name').setCustomValidity(''));
$('task-dialog').addEventListener('close', () => {
  if (editing && document.activeElement === document.body) {
    document.querySelector(`[data-planned-id="${editing}"]`)?.focus();
  }
});
$('new-task').addEventListener('click', () => $('type-dialog').showModal());
for (const button of document.querySelectorAll('[data-new-kind]')) {
  button.addEventListener('click', () => {
    $('type-dialog').close();
    openTask(null, button.dataset.newKind);
  });
}
for (const button of document.querySelectorAll('[data-open-sessions]')) {
  button.addEventListener('click', () => {
    $('sessions-date').textContent = $('date-text').textContent;
    const list = $('session-list');
    list.replaceChildren();
    const records = sessions.get(date) ?? [];
    for (const { id, minutes } of records) {
      const entry = create('li', '', 'planned-row');
      entry.append(itemName(tasks.get(id)), create('span', duration(minutes), 'task-time'));
      list.append(entry);
    }
    if (!records.length) list.append(create('li', 'No sessions logged for this day.', 'muted'));
    $('sessions-dialog').showModal();
  });
}
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
  document.querySelectorAll('.group.over-target').forEach((group) => group.classList.remove('over-target'));
}
dropSurface.addEventListener('dragover', (event) => {
  if (draggedTask?.source !== 'available') return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'copy';
  dropSurface.classList.add('over-target');
});
dropSurface.addEventListener('dragleave', (event) => {
  if (!dropSurface.contains(event.relatedTarget)) dropSurface.classList.remove('over-target');
});
dropSurface.addEventListener('drop', (event) => {
  if (draggedTask?.source !== 'available') return;
  event.preventDefault();
  addTask(draggedTask.id, false);
  clearDrag();
});

for (const group of document.querySelectorAll('.group[data-status]')) {
  group.addEventListener('dragover', (event) => {
    if (draggedTask?.source !== 'plan') return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    group.classList.add('over-target');
  });
  group.addEventListener('dragleave', (event) => {
    if (!group.contains(event.relatedTarget)) group.classList.remove('over-target');
  });
  group.addEventListener('drop', (event) => {
    if (draggedTask?.source !== 'plan') return;
    event.preventDefault();
    const { id, date: planDate } = draggedTask;
    const task = tasks.get(id);
    if (task && task.kind !== 'event' && plans.get(planDate)?.delete(id)) {
      task.status = group.dataset.status;
      render();
      $('announcement').textContent = `Removed ${task.name} from the plan and moved it to ${group.querySelector('h3').textContent}.`;
    }
    clearDrag();
  });
}

document.addEventListener('DOMContentLoaded', render);
