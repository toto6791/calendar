/*
 * Съхранение на събитията със синхронизация.
 *
 * Как работи:
 *  - Събитията се показват веднага от копие в браузъра (бързо и без интернет).
 *  - Всяка промяна се записва като „чакаща“ и се изпраща към файла events.json в GitHub.
 *  - На всеки 30 секунди и при връщане към страницата се изтеглят промените
 *    от другите устройства.
 *  - Ако няма интернет, промените чакат и се изпращат, когато връзката се върне.
 */
const Storage = (function () {
  const CACHE_KEY = 'kalendar-cache';      // последното известно съдържание от GitHub
  const PENDING_KEY = 'kalendar-pending';  // промени, които още не са изпратени
  const OLD_KEY = 'kalendar-events';       // старият формат (само на устройството)
  const MIGRATED_KEY = 'kalendar-migrated';
  const POLL_MS = 30000;

  function load(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }
  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
  }

  let cache = load(CACHE_KEY, { events: {}, sha: null });
  let pending = load(PENDING_KEY, []);
  let status = 'idle';
  let busy = false;
  let again = false;
  let timer = null;
  const listeners = [];

  // Еднократно прехвърляне на събития, въведени преди синхронизацията
  if (!localStorage.getItem(MIGRATED_KEY)) {
    const old = load(OLD_KEY, null);
    if (old && Object.keys(old).length) pending.push({ t: 'merge', events: old });
    save(PENDING_KEY, pending);
    localStorage.setItem(MIGRATED_KEY, '1');
  }

  // ----- Прилагане на промени върху данните -----
  function clone(o) { return JSON.parse(JSON.stringify(o || {})); }

  function applyOp(events, op) {
    if (op.t === 'add') {
      const list = events[op.d] || [];
      if (!list.some(function (e) { return e.id === op.ev.id; })) list.push(op.ev);
      events[op.d] = list;
    } else if (op.t === 'upd') {
      const ev = (events[op.d] || []).find(function (e) { return e.id === op.id; });
      if (ev) Object.keys(op.ch).forEach(function (k) {
        if (op.ch[k] === null) delete ev[k]; else ev[k] = op.ch[k];
      });
    } else if (op.t === 'del') {
      events[op.d] = (events[op.d] || []).filter(function (e) { return e.id !== op.id; });
      if (!events[op.d].length) delete events[op.d];
    } else if (op.t === 'merge') {
      Object.keys(op.events).forEach(function (d) {
        (op.events[d] || []).forEach(function (ev) { applyOp(events, { t: 'add', d: d, ev: ev }); });
      });
    }
    return events;
  }

  function applyAll(events, ops) {
    ops.forEach(function (op) { applyOp(events, op); });
    return events;
  }

  // Това, което виждаме = последното от GitHub + още неизпратените промени
  let view = applyAll(clone(cache.events), pending);
  let viewJson = JSON.stringify(view);

  function refreshView() {
    view = applyAll(clone(cache.events), pending);
    const json = JSON.stringify(view);
    if (json !== viewJson) {
      viewJson = json;
      listeners.forEach(function (fn) { fn('data'); });
    }
  }

  function setStatus(s) {
    if (s === status) return;
    status = s;
    listeners.forEach(function (fn) { fn('status'); });
  }

  function describe(op) {
    if (op.t === 'add') return 'добавено „' + op.ev.title + '“ (' + op.d + ')';
    if (op.t === 'del') return 'изтрито събитие (' + op.d + ')';
    if (op.t === 'upd') return 'променено събитие (' + op.d + ')';
    return 'прехвърлени стари събития';
  }

  // ----- Синхронизация с GitHub -----
  async function sync() {
    if (!GitHub.isConfigured()) { setStatus('local'); return; }
    if (busy) { again = true; return; }
    busy = true;
    setStatus('syncing');
    try {
      for (let attempt = 0; attempt < 5; attempt++) {
        const remote = await GitHub.readFile();
        const base = (remote.data && remote.data.events) || {};
        if (!pending.length) {
          cache = { events: base, sha: remote.sha };
          save(CACHE_KEY, cache);
          break;
        }
        const ops = pending.slice();
        const merged = applyAll(clone(base), ops);
        try {
          const sha = await GitHub.writeFile(
            { version: 1, events: merged }, remote.sha,
            'Календар: ' + ops.map(describe).join(', ').slice(0, 200));
          cache = { events: merged, sha: sha };
          save(CACHE_KEY, cache);
          pending = pending.slice(ops.length);
          save(PENDING_KEY, pending);
          if (!pending.length) break;
        } catch (e) {
          if (!e.conflict) throw e;
          // Друго устройство е записало точно сега — четем отново и повтаряме
          await new Promise(function (r) { setTimeout(r, 700 + Math.random() * 800); });
        }
      }
      setStatus(pending.length ? 'pending' : 'ok');
    } catch (e) {
      setStatus(e.auth || e.notFound ? 'auth' : 'offline');
    }
    busy = false;
    refreshView();
    if (again) { again = false; sync(); }
  }

  function queue(op) {
    pending.push(op);
    save(PENDING_KEY, pending);
    refreshView();
    clearTimeout(timer);
    timer = setTimeout(sync, 300);
    return true;
  }

  function sortEvents(list) {
    return list.sort(function (a, b) {
      if (!a.time && !b.time) return a.created - b.created;
      if (!a.time) return -1;
      if (!b.time) return 1;
      return a.time.localeCompare(b.time);
    });
  }

  // Автоматично опресняване
  setInterval(function () { if (!document.hidden) sync(); }, POLL_MS);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) sync(); });
  window.addEventListener('online', sync);
  window.addEventListener('pageshow', function (e) { if (e.persisted) sync(); });
  setTimeout(sync, 0);

  return {
    getEvents: function (dateKey) {
      return sortEvents(clone(view[dateKey] || []));
    },
    countEvents: function (dateKey) {
      return (view[dateKey] || []).length;
    },
    addEvent: function (dateKey, event) {
      event.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      event.created = Date.now();
      return queue({ t: 'add', d: dateKey, ev: event });
    },
    updateEvent: function (dateKey, id, changes) {
      return queue({ t: 'upd', d: dateKey, id: id, ch: changes });
    },
    deleteEvent: function (dateKey, id) {
      return queue({ t: 'del', d: dateKey, id: id });
    },
    // fn('data') при нови данни, fn('status') при промяна на състоянието
    onChange: function (fn) { listeners.push(fn); },
    getStatus: function () { return status; },
    hasPending: function () { return pending.length > 0; },
    sync: sync
  };
})();
