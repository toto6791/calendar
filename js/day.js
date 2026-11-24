/* Страница за един ден — day.html?d=ГГГГ-ММ-ДД */
(function () {
  const params = new URLSearchParams(location.search);
  const date = Dates.fromKey(params.get('d')) || new Date();
  const key = Dates.toKey(date);
  const today = new Date();

  const list = document.getElementById('eventList');
  const empty = document.getElementById('emptyMsg');
  const form = document.getElementById('eventForm');
  const hourSel = document.getElementById('eventHour');
  const minuteSel = document.getElementById('eventMinute');

  // Падащи списъци за час във формат 24 часа (00–23) и минути през 5
  function fillTimeSelects() {
    hourSel.appendChild(new Option('цял ден', ''));
    for (let h = 0; h < 24; h++) {
      const v = String(h).padStart(2, '0');
      hourSel.appendChild(new Option(v, v));
    }
    for (let m = 0; m < 60; m += 5) {
      const v = String(m).padStart(2, '0');
      minuteSel.appendChild(new Option(v, v));
    }
    updateMinuteState();
  }

  // Минутите са активни само когато е избран час
  function updateMinuteState() {
    minuteSel.disabled = hourSel.value === '';
  }
  hourSel.addEventListener('change', updateMinuteState);
  fillTimeSelects();

  // Заглавна част
  document.getElementById('dayNumber').textContent = date.getDate();
  document.getElementById('dayWeekday').textContent =
    Dates.isSameDay(date, today) ? 'Днес, ' + Dates.WEEKDAYS[date.getDay()].toLowerCase() : Dates.WEEKDAYS[date.getDay()];
  document.getElementById('dayMonth').textContent = Dates.MONTHS[date.getMonth()] + ' ' + date.getFullYear();
  if (Dates.isSameDay(date, today)) document.querySelector('.day-head').classList.add('is-today');
  document.title = date.getDate() + ' ' + Dates.MONTHS[date.getMonth()] + ' ' + date.getFullYear();

  // Навигация
  document.getElementById('prevDay').href = 'day.html?d=' + Dates.toKey(Dates.addDays(date, -1));
  document.getElementById('nextDay').href = 'day.html?d=' + Dates.toKey(Dates.addDays(date, 1));
  document.getElementById('backLink').href = 'index.html#' + key.slice(0, 7);

  function render() {
    const events = Storage.getEvents(key);
    list.innerHTML = '';
    empty.hidden = events.length > 0;

    events.forEach(function (ev) {
      const li = document.createElement('li');
      li.className = 'event';

      const time = document.createElement('span');
      time.className = 'event-time' + (ev.time ? '' : ' no-time');
      time.textContent = ev.time || 'цял ден';

      const body = document.createElement('div');
      const t = document.createElement('p');
      t.className = 'event-title';
      t.textContent = ev.title;
      body.appendChild(t);
      if (ev.note) {
        const n = document.createElement('p');
        n.className = 'event-note';
        n.textContent = ev.note;
        body.appendChild(n);
      }

      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'delete-btn';
      del.textContent = 'Изтрий';
      del.setAttribute('aria-label', 'Изтрий „' + ev.title + '“');
      del.addEventListener('click', function () {
        if (confirm('Да се изтрие ли „' + ev.title + '“?')) {
          Storage.deleteEvent(key, ev.id);
          render();
        }
      });

      li.appendChild(time);
      li.appendChild(body);
      li.appendChild(del);
      list.appendChild(li);
    });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    const title = form.title.value.trim();
    if (!title) { form.title.focus(); return; }
    const ok = Storage.addEvent(key, {
      time: hourSel.value ? hourSel.value + ':' + minuteSel.value : '',
      title: title,
      note: form.note.value.trim()
    });
    if (ok) {
      form.reset();
      updateMinuteState();
      render();
    }
  });

  // Плъзгане наляво/надясно сменя деня
  let touchX = null, touchY = null;
  document.querySelector('.day-head').addEventListener('touchstart', function (e) {
    touchX = e.touches[0].clientX; touchY = e.touches[0].clientY;
  }, { passive: true });
  document.querySelector('.day-head').addEventListener('touchend', function (e) {
    if (touchX === null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    const dy = e.changedTouches[0].clientY - touchY;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) {
      location.href = document.getElementById(dx < 0 ? 'nextDay' : 'prevDay').href;
    }
    touchX = null;
  });

  render();
})();
