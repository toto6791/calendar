/*
 * Съхранение на събитията.
 * Засега данните се пазят в браузъра (localStorage).
 * По-късно този файл може да се смени с връзка към сървър (PHP/MySQL),
 * без да се променят останалите скриптове.
 */
const Storage = (function () {
  const KEY = 'kalendar-events';

  function readAll() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  function writeAll(data) {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
      return true;
    } catch (e) {
      alert('Събитието не беше записано: паметта на браузъра не е достъпна.');
      return false;
    }
  }

  function sortEvents(list) {
    return list.sort(function (a, b) {
      if (!a.time && !b.time) return a.created - b.created;
      if (!a.time) return -1;
      if (!b.time) return 1;
      return a.time.localeCompare(b.time);
    });
  }

  return {
    getEvents: function (dateKey) {
      return sortEvents((readAll()[dateKey] || []).slice());
    },
    countEvents: function (dateKey) {
      return (readAll()[dateKey] || []).length;
    },
    addEvent: function (dateKey, event) {
      const data = readAll();
      const list = data[dateKey] || [];
      event.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      event.created = Date.now();
      list.push(event);
      data[dateKey] = list;
      return writeAll(data);
    },
    deleteEvent: function (dateKey, id) {
      const data = readAll();
      data[dateKey] = (data[dateKey] || []).filter(function (e) { return e.id !== id; });
      if (data[dateKey].length === 0) delete data[dateKey];
      return writeAll(data);
    }
  };
})();
