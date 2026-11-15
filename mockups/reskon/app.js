const toast = document.querySelector('.toast');
let toastTimer;
function say(message) {
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2500);
}
document.querySelectorAll('[data-demo]').forEach(el => el.addEventListener('click', event => {
  event.preventDefault();
  say('This is a design preview — this control is illustrative.');
}));
document.querySelectorAll('[data-segment]').forEach(el => el.addEventListener('click', () => {
  el.parentElement.querySelectorAll('button').forEach(button => button.classList.remove('selected'));
  el.classList.add('selected');
}));
const search = document.querySelector('#search');
search?.addEventListener('input', () => {
  const query = search.value.trim().toLowerCase();
  document.querySelectorAll('.board .task').forEach(task => task.classList.toggle('hidden', !task.textContent.toLowerCase().includes(query)));
});
document.addEventListener('keydown', event => {
  if (event.key === '/' && search && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) { event.preventDefault(); search.focus(); }
});
const dialog = document.querySelector('#task-dialog');
let targetColumn = document.querySelector('.column');
document.querySelectorAll('#new-task, [data-add]').forEach(button => button.addEventListener('click', () => {
  targetColumn = button.closest('.column') || document.querySelector('.column');
  dialog?.showModal();
}));
document.querySelector('#save-task')?.addEventListener('click', event => {
  const input = document.querySelector('#task-name');
  if (!input.value.trim()) { event.preventDefault(); input.focus(); return; }
  const task = document.createElement('article');
  task.className = 'task';
  const title = document.createElement('h3');
  title.textContent = input.value.trim();
  task.append(title);
  targetColumn.querySelector('.cards').append(task);
  const count = targetColumn.querySelector('.count');
  count.textContent = String(Number(count.textContent) + 1);
  input.value = '';
  say('Added to this preview. It will reset when you reload.');
});
