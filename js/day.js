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
  const filterSel = document.getElementById('filterSel');
  const hiddenNote = document.getElementById('hiddenNote');
  const authorLine = document.getElementById('authorLine');
  const authorName = document.getElementById('authorName');
  const nameField = document.getElementById('nameField');
  const authorInput = document.getElementById('authorInput');

  // Име на потребителя: полето се показва само докато няма запазено име
  function showAuthor(editing) {
    const name = Who.getName();
    authorInput.value = name;
    authorName.textContent = name;
    const edit = editing || !name;
    nameField.hidden = !edit;
    authorLine.hidden = edit;
    authorInput.required = edit;
  }
  document.getElementById('changeName').addEventListener('click', function () {
    showAuthor(true);
    authorInput.focus();
    authorInput.select();
  });
  showAuthor(false);

  filterSel.addEventListener('change', function () {
    Who.setFilter(filterSel.value);
    render();
  });

  // Минутите са активни само когато е избран час
  function updateMinuteState() {
    minuteSel.disabled = hourSel.value === '';
  }
  hourSel.addEventListener('change', updateMinuteState);
  updateMinuteState();

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

  let lastJson = '';

  // Бутон „Добави в календара на телефона“ / „Премахни“
  function phoneCalBlock(ev) {
    const box = document.createElement('div');
    box.className = 'cal-box';

    function btn(text, cls, onClick) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = cls;
      b.textContent = text;
      b.addEventListener('click', onClick);
      return b;
    }
    function row() {
      const r = document.createElement('div');
      r.className = 'cal-row';
      for (let i = 0; i < arguments.length; i++) r.appendChild(arguments[i]);
      return r;
    }
    function info(text) {
      const p = document.createElement('p');
      p.className = 'cal-info';
      p.textContent = text;
      return p;
    }
    function mark(value) {
      Storage.updateEvent(key, ev.id, { phoneCal: value });
      render();
    }

    // 1) Не е добавено
    function showAdd() {
      box.innerHTML = '';
      box.appendChild(btn('Добави в календара на телефона', 'cal-btn', showChoice));
    }

    // 2) Избор на календар
    function showChoice() {
      box.innerHTML = '';
      box.appendChild(info('Изберете календар. Напомнянето ще звъни в часа на събитието' +
        (ev.time ? '.' : ' (за „цял ден“ — в 09:00).')));
      box.appendChild(row(
        btn('iPhone / Samsung / Outlook', 'cal-btn', function () {
          PhoneCal.downloadIcs(key, ev);
          mark('ics');
        }),
        btn('Google Календар', 'cal-btn', function () {
          window.open(PhoneCal.googleUrl(key, ev), '_blank', 'noopener');
          mark('google');
        }),
        btn('Отказ', 'cal-link', showAdd)
      ));
    }

    // 3) Добавено
    function showAdded() {
      box.innerHTML = '';
      const ok = document.createElement('span');
      ok.className = 'cal-ok';
      ok.textContent = '✓ В календара на телефона';
      box.appendChild(row(ok, btn('Премахни', 'cal-link', showRemove)));
    }

    // 4) Премахване — изтрива се ръчно в календара на телефона
    function showRemove() {
      box.innerHTML = '';
      box.appendChild(info('Сайтът няма достъп да трие от календара на телефона. ' +
        'Отворете календара, намерете „' + ev.title + '“ на тази дата и го изтрийте. ' +
        'След това натиснете „Готово“.'));
      const buttons = [];
      if (ev.phoneCal === 'google') {
        const a = document.createElement('a');
        a.className = 'cal-btn';
        a.href = PhoneCal.googleDayUrl(key);
        a.target = '_blank';
        a.rel = 'noopener';
        a.textContent = 'Отвори Google Календар';
        buttons.push(a);
      }
      buttons.push(btn('Готово, изтрих го', 'cal-btn', function () { mark(null); }));
      buttons.push(btn('Отказ', 'cal-link', showAdded));
      box.appendChild(row.apply(null, buttons));
    }

    if (ev.phoneCal) showAdded(); else showAdd();
    return box;
  }

  function render() {
    const all = Storage.getEvents(key);
    lastJson = JSON.stringify(all);
    const filter = Who.fillSelect(filterSel, Storage.getAuthors());
    const events = all.filter(function (ev) { return Who.matches(ev, filter); });
    const hiddenCount = all.length - events.length;

    list.innerHTML = '';
    empty.hidden = all.length > 0;

    // Има събития, но филтърът ги скрива
    hiddenNote.hidden = hiddenCount === 0;
    hiddenNote.innerHTML = '';
    if (hiddenCount) {
      hiddenNote.appendChild(document.createTextNode(
        (events.length ? 'Още ' : '') + hiddenCount +
        (hiddenCount === 1 ? ' събитие е скрито' : ' събития са скрити') + ' от филтъра. '));
      const showAll = document.createElement('button');
      showAll.type = 'button';
      showAll.className = 'cal-link';
      showAll.textContent = 'Покажи всички';
      showAll.addEventListener('click', function () { Who.setFilter('all'); render(); });
      hiddenNote.appendChild(showAll);
    }

    events.forEach(function (ev) {
      const li = document.createElement('li');
      li.className = 'event';

      const time = document.createElement('span');
      time.className = 'event-time' + (ev.time ? '' : ' no-time');
      time.textContent = ev.time || 'цял ден';

      const mine = Who.isMine(ev);
      if (Who.getName()) li.classList.add(mine ? 'is-mine' : 'is-other');

      const body = document.createElement('div');
      const t = document.createElement('p');
      t.className = 'event-title';
      t.textContent = ev.title;
      body.appendChild(t);
      const who = document.createElement('p');
      who.className = 'event-author';
      who.textContent = mine ? 'Добавено от вас' :
        (ev.author ? 'Добавено от ' + ev.author : 'Без посочен автор');
      body.appendChild(who);
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
        let msg = 'Да се изтрие ли „' + ev.title + '“?';
        if (ev.phoneCal) msg += '\n\nТо е добавено в календара на телефона. Изтрийте го и там, иначе алармата ще звънне.';
        if (confirm(msg)) {
          Storage.deleteEvent(key, ev.id);
          render();
        }
      });

      li.appendChild(time);
      li.appendChild(body);
      li.appendChild(del);
      li.appendChild(phoneCalBlock(ev));
      list.appendChild(li);
    });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    const title = form.title.value.trim();
    if (!title) { form.title.focus(); return; }
    if (!nameField.hidden) {
      if (!authorInput.value.trim()) { authorInput.focus(); return; }
      Who.setName(authorInput.value);
    }
    const ok = Storage.addEvent(key, {
      time: hourSel.value ? hourSel.value + ':' + minuteSel.value : '',
      title: title,
      note: form.note.value.trim(),
      author: Who.getName()
    });
    if (ok) {
      form.reset();
      updateMinuteState();
      showAuthor(false);
      // Новото събитие да се вижда, дори ако е избран филтър за друг човек
      const f = Who.getFilter();
      if (f !== 'all' && f !== 'mine') Who.setFilter('all');
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

  // Нови данни от другото устройство
  Storage.onChange(function (what) {
    if (what !== 'data') return;
    const json = JSON.stringify(Storage.getEvents(key));
    if (json !== lastJson) { lastJson = json; render(); }
  });

  render();
})();
