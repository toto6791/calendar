/* Показва състоянието на синхронизацията в елемент #syncStatus */
(function () {
  const el = document.getElementById('syncStatus');
  if (!el) return;

  const TEXT = {
    idle: '',
    local: 'Събитията са само на това устройство.',
    syncing: 'Синхронизиране…',
    ok: 'Синхронизирано',
    pending: 'Има незаписани промени. Ще бъдат изпратени автоматично.',
    offline: 'Няма връзка. Промените ще се запишат, когато се появи интернет.',
    auth: 'Няма достъп до GitHub. Проверете настройките.'
  };
  const NEEDS_LINK = { local: 'Настройте синхронизация', auth: 'Към настройките' };

  function show() {
    const s = Storage.getStatus();
    el.className = 'sync-status is-' + s;
    el.textContent = TEXT[s] || '';
    if (NEEDS_LINK[s]) {
      const a = document.createElement('a');
      a.href = 'settings.html';
      a.textContent = NEEDS_LINK[s];
      el.appendChild(document.createTextNode(' '));
      el.appendChild(a);
    }
  }

  Storage.onChange(function (what) { if (what === 'status') show(); });
  show();
})();
