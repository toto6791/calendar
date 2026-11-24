/* Страница с настройки на синхронизацията — settings.html */
(function () {
  const form = document.getElementById('settingsForm');
  const msg = document.getElementById('formMsg');
  const btn = document.getElementById('saveBtn');
  const forget = document.getElementById('forgetBtn');
  const f = {
    owner: document.getElementById('owner'),
    repo: document.getElementById('repo'),
    token: document.getElementById('token'),
    branch: document.getElementById('branch'),
    path: document.getElementById('path')
  };

  const cfg = GitHub.getConfig();
  if (cfg) {
    f.owner.value = cfg.owner || '';
    f.repo.value = cfg.repo || '';
    f.token.value = cfg.token || '';
    f.branch.value = cfg.branch || 'main';
    f.path.value = cfg.path || 'events.json';
    forget.hidden = false;
  }

  function say(text, kind) {
    msg.textContent = text;
    msg.className = 'form-msg' + (kind ? ' is-' + kind : '');
  }

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    const c = {
      owner: f.owner.value.trim(),
      repo: f.repo.value.trim().replace(/\.git$/, ''),
      token: f.token.value.trim(),
      branch: f.branch.value.trim() || 'main',
      path: (f.path.value.trim() || 'events.json').replace(/^\/+/, '')
    };
    // Ако е поставен целият адрес на хранилището
    const m = /github\.com\/([^/]+)\/([^/?#]+)/.exec(c.repo);
    if (m) { c.owner = m[1]; c.repo = m[2].replace(/\.git$/, ''); }

    btn.disabled = true;
    say('Проверка…');
    let result;
    try {
      result = await GitHub.check(c);
    } catch (err) {
      result = { ok: false, msg: 'Няма връзка с GitHub. Проверете интернета.' };
    }
    btn.disabled = false;

    if (!result.ok) { say(result.msg, 'error'); return; }
    if (!result.isPrivate &&
        !confirm('Хранилището е ПУБЛИЧНО — всеки ще може да чете събитията ви. Да продължа ли въпреки това?')) {
      say('Направете хранилището частно (Settings → Danger Zone → Change visibility) и опитайте отново.', 'error');
      return;
    }

    GitHub.setConfig(c);
    forget.hidden = false;
    say('Връзката работи. Синхронизиране…', 'ok');
    await Storage.sync();
    const s = Storage.getStatus();
    if (s === 'ok') say('Готово. Събитията се синхронизират с ' + c.owner + '/' + c.repo + '.', 'ok');
    else say('Настройките са запазени, но синхронизацията не успя. Опитайте пак след малко.', 'error');
  });

  forget.addEventListener('click', function () {
    if (!confirm('Да се премахнат ли настройките и ключът от това устройство? Събитията в GitHub остават.')) return;
    GitHub.clearConfig();
    form.reset();
    forget.hidden = true;
    say('Настройките са премахнати от това устройство.');
    Storage.sync();
  });
})();
