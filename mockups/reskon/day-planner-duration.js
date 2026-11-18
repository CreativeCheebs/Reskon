function createDurationPicker(label, initialMinutes, { max = 1440 } = {}) {
  const step = 5;
  const lastIndex = Math.max(0, Math.floor(max / step));
  const picker = document.createElement('div');
  picker.className = 'duration-picker';
  const heading = document.createElement('div');
  heading.className = 'duration-picker__heading';
  const title = document.createElement('span');
  title.textContent = label;
  const readout = document.createElement('strong');
  readout.setAttribute('aria-hidden', 'true');
  heading.append(title, readout);

  const track = document.createElement('div');
  track.className = 'duration-picker__track';
  const wheel = document.createElement('div');
  wheel.className = 'duration-picker__wheel';
  wheel.tabIndex = 0;
  wheel.setAttribute('role', 'spinbutton');
  wheel.setAttribute('aria-label', label);
  wheel.setAttribute('aria-valuemin', '0');
  wheel.setAttribute('aria-valuemax', String(lastIndex * step));

  const options = Array.from({ length: lastIndex + 1 }, (_, index) => {
    const option = document.createElement('span');
    option.className = 'duration-picker__option';
    option.dataset.index = index;
    option.textContent = format(index * step);
    option.setAttribute('aria-hidden', 'true');
    return option;
  });
  wheel.append(...options);
  const cursor = document.createElement('div');
  cursor.className = 'duration-picker__cursor';
  cursor.setAttribute('aria-hidden', 'true');
  track.append(wheel, cursor);
  picker.append(heading, track);

  let selected = -1;
  let previousWidth = 0;

  function format(minutes, long = false) {
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    if (long) {
      const parts = [];
      if (hours) parts.push(hours + (hours === 1 ? ' hour' : ' hours'));
      if (remainder || !hours) parts.push(remainder + (remainder === 1 ? ' minute' : ' minutes'));
      return parts.join(' ');
    }
    if (!hours) return remainder + 'm';
    return hours + 'h' + (remainder ? ' ' + remainder + 'm' : '');
  }

  function limit(index) {
    return Math.max(0, Math.min(lastIndex, index));
  }

  function select(index) {
    const next = limit(index);
    if (next === selected) return;
    const minutes = next * step;
    options[selected]?.classList.remove('is-selected');
    selected = next;
    options[selected].classList.add('is-selected');
    readout.textContent = format(minutes);
    wheel.setAttribute('aria-valuenow', String(minutes));
    wheel.setAttribute('aria-valuetext', format(minutes, true));
  }

  function optionWidth() {
    return options[0].getBoundingClientRect().width;
  }

  function align() {
    const width = optionWidth();
    if (width) wheel.scrollLeft = width * selected;
  }

  function setMinutes(minutes) {
    const value = Number(minutes);
    select(Number.isFinite(value) ? Math.round(value / step) : 0);
    align();
  }

  wheel.addEventListener('scroll', () => {
    const width = optionWidth();
    if (width) select(Math.round(wheel.scrollLeft / width));
  }, { passive: true });

  wheel.addEventListener('click', (event) => {
    const option = event.target.closest('.duration-picker__option');
    if (!option) return;
    setMinutes(Number(option.dataset.index) * step);
  });

  wheel.addEventListener('keydown', (event) => {
    const indices = {
      ArrowLeft: selected - 1,
      ArrowDown: selected - 1,
      ArrowRight: selected + 1,
      ArrowUp: selected + 1,
      PageDown: selected - 12,
      PageUp: selected + 12,
      Home: 0,
      End: lastIndex,
    };
    if (!Object.hasOwn(indices, event.key)) return;
    event.preventDefault();
    setMinutes(indices[event.key] * step);
  });

  setMinutes(initialMinutes);
  // A picker can be rendered before its sheet has opened and has a layout.
  const observer = new ResizeObserver(() => {
    const width = wheel.clientWidth;
    if (width && width !== previousWidth) align();
    previousWidth = width;
  });
  observer.observe(wheel);

  return {
    element: picker,
    get value() { return selected * step; },
    set value(minutes) { setMinutes(minutes); },
  };
}
