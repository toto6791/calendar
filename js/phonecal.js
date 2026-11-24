/*
 * Добавяне на събитие в календара на телефона.
 *  - .ics файл: iPhone (Apple Календар), Samsung, Outlook и др.
 *  - връзка към Google Календар: Android и всеки с Google профил.
 * Напомнянето (алармата) се пази в самия календар на телефона,
 * затова звъни и когато сайтът е затворен.
 */
const PhoneCal = (function () {
  const ALL_DAY_ALARM_HOUR = 9;   // за събития „цял ден“ — напомняне в 09:00
  const DEFAULT_DURATION_MIN = 60;

  function pad(n) { return String(n).padStart(2, '0'); }

  function compact(d) {
    return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate());
  }
  function compactTime(d) {
    return compact(d) + 'T' + pad(d.getHours()) + pad(d.getMinutes()) + '00';
  }

  // Начало и край на събитието
  function range(dateKey, ev) {
    const day = Dates.fromKey(dateKey);
    if (!ev.time) {
      return { allDay: true, start: day, end: Dates.addDays(day, 1) };
    }
    const p = ev.time.split(':');
    const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), +p[0], +p[1]);
    const end = new Date(start.getTime() + DEFAULT_DURATION_MIN * 60000);
    return { allDay: false, start: start, end: end };
  }

  // Специалните символи в .ics трябва да се екранират
  function esc(text) {
    return String(text || '')
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\r?\n/g, '\\n');
  }

  // Дългите редове се пренасят (изискване на формата)
  function fold(line) {
    const parts = [];
    while (line.length > 40) {
      parts.push(line.slice(0, 40));
      line = ' ' + line.slice(40);
    }
    parts.push(line);
    return parts.join('\r\n');
  }

  function buildIcs(dateKey, ev) {
    const r = range(dateKey, ev);
    const now = new Date();
    const stamp = now.getUTCFullYear() + pad(now.getUTCMonth() + 1) + pad(now.getUTCDate()) + 'T' +
      pad(now.getUTCHours()) + pad(now.getUTCMinutes()) + pad(now.getUTCSeconds()) + 'Z';

    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Kalendar//BG',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      'UID:' + ev.id + '@kalendar',
      'DTSTAMP:' + stamp
    ];
    if (r.allDay) {
      lines.push('DTSTART;VALUE=DATE:' + compact(r.start));
      lines.push('DTEND;VALUE=DATE:' + compact(r.end));
    } else {
      // Без „Z“ — часът се тълкува като местно време на телефона
      lines.push('DTSTART:' + compactTime(r.start));
      lines.push('DTEND:' + compactTime(r.end));
    }
    lines.push('SUMMARY:' + esc(ev.title));
    if (ev.note) lines.push('DESCRIPTION:' + esc(ev.note));
    lines.push(
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      'DESCRIPTION:' + esc(ev.title),
      r.allDay ? 'TRIGGER:PT' + ALL_DAY_ALARM_HOUR + 'H' : 'TRIGGER:-PT0M',
      'END:VALARM',
      'END:VEVENT',
      'END:VCALENDAR'
    );
    return lines.map(fold).join('\r\n') + '\r\n';
  }

  function downloadIcs(dateKey, ev) {
    const blob = new Blob([buildIcs(dateKey, ev)], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sabitie-' + dateKey + '.ics';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
  }

  function googleUrl(dateKey, ev) {
    const r = range(dateKey, ev);
    const dates = r.allDay
      ? compact(r.start) + '/' + compact(r.end)
      : compactTime(r.start) + '/' + compactTime(r.end);
    const params = new URLSearchParams({ action: 'TEMPLATE', text: ev.title, dates: dates });
    if (ev.note) params.set('details', ev.note);
    try { params.set('ctz', Intl.DateTimeFormat().resolvedOptions().timeZone); } catch (e) {}
    return 'https://calendar.google.com/calendar/render?' + params.toString();
  }

  // Отваря деня в Google Календар (за ръчно изтриване)
  function googleDayUrl(dateKey) {
    return 'https://calendar.google.com/calendar/r/day/' + dateKey.replace(/-/g, '/');
  }

  return { downloadIcs: downloadIcs, googleUrl: googleUrl, googleDayUrl: googleDayUrl };
})();
