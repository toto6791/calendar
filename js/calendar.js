/* Месечен календар — index.html */
(function () {
  const grid = document.getElementById('daysGrid');
  const title = document.getElementById('monthTitle');
  const filterSel = document.getElementById('filterSel');
  const legend = document.getElementById('legend');
  const today = new Date();

  // Избор „Всички / Само моите / на конкретен човек“
  filterSel.addEventListener('change', function () {
    Who.setFilter(filterSel.value);
    render();
  });

  // Месецът се помни в адреса (#2026-11), за да работи бутонът "Назад"
  function monthFromHash() {
    const m = /^#(\d{4})-(\d{2})$/.exec(location.hash);
    if (m) return new Date(+m[1], +m[2] - 1, 1);
    return new Date(today.getFullYear(), today.getMonth(), 1);
  }

  let current = monthFromHash();

  function setMonth(d) {
    current = new Date(d.getFullYear(), d.getMonth(), 1);
    const hash = '#' + current.getFullYear() + '-' + String(current.getMonth() + 1).padStart(2, '0');
    history.replaceState(null, '', hash);
    render();
  }

  function render() {
    const year = current.getFullYear();
    const month = current.getMonth();
    title.textContent = Dates.MONTHS_TITLE[month] + ' ' + year;

    const filter = Who.fillSelect(filterSel, Storage.getAuthors());
    // Цветовете „мои / на други“ имат смисъл само в общия изглед
    legend.hidden = !(filter === 'all' && Who.getName());
    document.title = 'Календар – ' + Dates.MONTHS_TITLE[month] + ' ' + year;

    // Седмицата започва от понеделник
    const first = new Date(year, month, 1);
    const offset = (first.getDay() + 6) % 7;
    const start = Dates.addDays(first, -offset);

    grid.innerHTML = '';
    for (let i = 0; i < 42; i++) {
      const d = Dates.addDays(start, i);
      const key = Dates.toKey(d);
      const a = document.createElement('a');
      a.className = 'day-cell';
      a.href = 'day.html?d=' + key;
      a.setAttribute('role', 'gridcell');

      if (d.getMonth() !== month) a.classList.add('other-month');
      if (d.getDay() === 0 || d.getDay() === 6) a.classList.add('weekend');
      if (Dates.isSameDay(d, today)) {
        a.classList.add('today');
        a.setAttribute('aria-current', 'date');
      }

      const shown = Storage.getEvents(key).filter(function (ev) { return Who.matches(ev, filter); });
      const count = shown.length;
      a.setAttribute('aria-label', d.getDate() + ' ' + Dates.MONTHS[d.getMonth()] +
        (count ? ', събития: ' + count : ''));

      const num = document.createElement('span');
      num.textContent = d.getDate();
      a.appendChild(num);

      if (count) {
        const dots = document.createElement('span');
        dots.className = 'dots';
        // Първо моите, после на другите; най-много 3 точки
        shown.sort(function (x, y) { return Who.isMine(y) - Who.isMine(x); });
        for (let j = 0; j < Math.min(count, 3); j++) {
          const dot = document.createElement('i');
          // Без зададено име всички точки са с обичайния цвят
          if (Who.getName()) dot.className = Who.isMine(shown[j]) ? 'mine' : 'other';
          dots.appendChild(dot);
        }
        a.appendChild(dots);
      }
      grid.appendChild(a);
    }
  }

  document.getElementById('prevMonth').addEventListener('click', function () {
    setMonth(new Date(current.getFullYear(), current.getMonth() - 1, 1));
  });
  document.getElementById('nextMonth').addEventListener('click', function () {
    setMonth(new Date(current.getFullYear(), current.getMonth() + 1, 1));
  });
  // „Днес“ отваря страницата на днешния ден
  document.getElementById('goToday').addEventListener('click', function () {
    location.href = 'day.html?d=' + Dates.toKey(new Date());
  });

  // Плъзгане наляво/надясно на телефон сменя месеца
  let touchX = null;
  grid.addEventListener('touchstart', function (e) { touchX = e.touches[0].clientX; }, { passive: true });
  grid.addEventListener('touchend', function (e) {
    if (touchX === null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 60) setMonth(new Date(current.getFullYear(), current.getMonth() + (dx < 0 ? 1 : -1), 1));
    touchX = null;
  });

  // Опресняване при връщане от страница на ден
  window.addEventListener('pageshow', render);
  // Нови данни от другото устройство
  Storage.onChange(function (what) { if (what === 'data') render(); });
  render();
})();
