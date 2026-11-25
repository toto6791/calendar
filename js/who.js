/*
 * Кой добавя събитията и кои събития да се показват.
 *  - Името на потребителя се пази само на това устройство.
 *  - Всяко ново събитие се записва с поле „author“.
 *  - Филтърът (всички / само моите / на конкретен човек) също се пази на устройството
 *    и е общ за календара и страницата на деня.
 */
const Who = (function () {
  const NAME_KEY = 'kalendar-name';
  const FILTER_KEY = 'kalendar-filter';

  function norm(s) { return String(s || '').trim().toLocaleLowerCase('bg'); }

  function getName() {
    try { return (localStorage.getItem(NAME_KEY) || '').trim(); } catch (e) { return ''; }
  }
  function setName(name) {
    name = String(name || '').trim().slice(0, 40);
    try {
      if (name) localStorage.setItem(NAME_KEY, name); else localStorage.removeItem(NAME_KEY);
    } catch (e) {}
    return name;
  }

  // 'all' | 'mine' | 'none' (без автор) | 'a:<име>'
  function getFilter() {
    let f = 'all';
    try { f = localStorage.getItem(FILTER_KEY) || 'all'; } catch (e) {}
    if (f === 'mine' && !getName()) f = 'all';
    return f;
  }
  function setFilter(f) {
    try { localStorage.setItem(FILTER_KEY, f); } catch (e) {}
  }

  function isMine(ev) {
    const me = getName();
    return !!me && norm(ev.author) === norm(me);
  }

  function matches(ev, filter) {
    filter = filter || getFilter();
    if (filter === 'all') return true;
    if (filter === 'mine') return isMine(ev);
    if (filter === 'none') return !norm(ev.author);
    if (filter.indexOf('a:') === 0) return norm(ev.author) === norm(filter.slice(2));
    return true;
  }

  // Попълва падащото меню с възможностите. authors = Storage.getAuthors()
  function fillSelect(select, authors) {
    const me = getName();
    let current = getFilter();
    const opts = [['all', 'Всички събития']];
    if (me) opts.push(['mine', 'Само моите']);
    authors.names.forEach(function (n) {
      if (me && norm(n) === norm(me)) return;
      opts.push(['a:' + n, 'Добавени от ' + n]);
    });
    if (authors.hasUnknown) opts.push(['none', 'Без посочен автор']);

    // Ако избраният човек вече няма събития — показваме всички
    if (!opts.some(function (o) { return norm(o[0]) === norm(current); })) current = 'all';

    select.innerHTML = '';
    opts.forEach(function (o) {
      const opt = document.createElement('option');
      opt.value = o[0];
      opt.textContent = o[1];
      if (norm(o[0]) === norm(current)) opt.selected = true;
      select.appendChild(opt);
    });
    return current;
  }

  return {
    getName: getName, setName: setName,
    getFilter: getFilter, setFilter: setFilter,
    isMine: isMine, matches: matches, fillSelect: fillSelect
  };
})();
