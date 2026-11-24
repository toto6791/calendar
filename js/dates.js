/* Помощни функции за дати на български */
const Dates = (function () {
  const MONTHS = ['януари', 'февруари', 'март', 'април', 'май', 'юни',
    'юли', 'август', 'септември', 'октомври', 'ноември', 'декември'];
  const MONTHS_TITLE = MONTHS.map(function (m) { return m.charAt(0).toUpperCase() + m.slice(1); });
  const WEEKDAYS = ['Неделя', 'Понеделник', 'Вторник', 'Сряда', 'Четвъртък', 'Петък', 'Събота'];

  function pad(n) { return String(n).padStart(2, '0'); }

  // Дата -> "2026-11-24"
  function toKey(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  // "2026-11-24" -> Date (или null, ако е невалидна)
  function fromKey(key) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key || '');
    if (!m) return null;
    const d = new Date(+m[1], +m[2] - 1, +m[3]);
    return d.getMonth() === +m[2] - 1 ? d : null;
  }

  function addDays(d, n) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  }

  function isSameDay(a, b) { return toKey(a) === toKey(b); }

  return { MONTHS: MONTHS, MONTHS_TITLE: MONTHS_TITLE, WEEKDAYS: WEEKDAYS,
    toKey: toKey, fromKey: fromKey, addDays: addDays, isSameDay: isSameDay };
})();
