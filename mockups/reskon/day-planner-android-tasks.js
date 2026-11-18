function openTask(task, item, pickerQuery) {
  const form = element('form', 'sheet-form');
  if (task) form.append(element('p', 'sheet-copy', [task.status, task.area].filter(Boolean).join(' · ')));
  else {
    const title = field('Task name', 'title', 'text', pickerQuery || '');
    title.querySelector('input').required = true;
    title.querySelector('input').maxLength = 160;
    form.append(title);
  }
  const estimate = createDurationPicker('Estimate', task?.estimate ?? 0);
  form.append(estimate.element);
  if (item) {
    form.append(element('p', 'sheet-copy',
      duration(loggedFor(selected, task.id)) + ' logged in sessions on this day.'));
  }
  const save = element('button', 'primary', item ? 'Save changes' : 'Add to plan');
  save.type = 'submit';
  form.append(save);
  if (pickerQuery !== undefined) {
    form.append(action('Back to task search', 'text-button', () => openPicker(pickerQuery)));
  }
  if (item) form.append(
    action('Log session', 'text-button', () => openLogSession(task)),
    action('More actions', 'text-button', () => openPlanActions(task)),
  );
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const title = task?.title || String(data.get('title')).trim();
    if (!title) {
      form.querySelector('[name="title"]').focus();
      return;
    }
    const currentTask = task || { id: nextId++, title, area: '', status: 'To do' };
    currentTask.estimate = estimate.value || null;
    if (currentTask.status === 'Inbox') currentTask.status = 'To do';
    if (!task) catalog.push(currentTask);
    if (!item) plans.set(selected, [...(plans.get(selected) || []), { id: currentTask.id }]);
    sheet.close();
    render();
    focusPlanEntry(currentTask.id);
    showToast(item ? 'Plan updated' : 'Added to plan');
  });
  openSheet(task ? task.title : 'New task', form);
  form.querySelector('[name="title"], [role="spinbutton"]').focus();
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
  const kinds = element('div', 'entry-choice');
  kinds.setAttribute('role', 'group');
  kinds.setAttribute('aria-label', 'What to add');
  const taskChoice = action('Task', 'text-button', () => searchInput.focus());
  taskChoice.setAttribute('aria-pressed', 'true');
  const eventChoice = action('Event', 'text-button', () => openEvent(null, null, searchInput.value));
  eventChoice.setAttribute('aria-pressed', 'false');
  kinds.append(taskChoice, eventChoice);
  picker.append(kinds, search, createTask, resultStatus, results);
  const inPlan = new Set((plans.get(selected) || []).map((item) => item.id));
  function renderResults() {
    const typed = searchInput.value.trim();
    const words = typed.toLowerCase().split(/\s+/).filter(Boolean);
    const groups = typed ? ['Inbox', 'To do', 'In progress', 'Backlog'] : ['Inbox', 'To do', 'In progress'];
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
  openSheet('Add to plan', picker);
  if (query) searchInput.focus();
}
