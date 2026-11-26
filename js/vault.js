/*
 * Сейф за ключа (settings.html) и бутоните „Покажи“/„Копирай“ до полето за ключа.
 * Сейфът пази текста на сървъра (api/vault.php), шифриран с паролата.
 */
(function () {
  const API = 'api/vault.php';
  const $ = function (id) { return document.getElementById(id); };

  // ----- Копиране (работи и без https чрез резервен начин) -----
  async function copyText(text) {
    if (!text) return false;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (e) { /* опитваме резервния начин */ }
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }

  function flash(btn, text) {
    const old = btn.dataset.label || btn.textContent;
    btn.dataset.label = old;
    btn.textContent = text;
    clearTimeout(btn._t);
    btn._t = setTimeout(function () { btn.textContent = old; }, 1600);
  }

  // ----- Полето за ключа във формата за синхронизация -----
  const tokenInput = $('token');
  const tokenShow = $('tokenShow');
  const tokenCopy = $('tokenCopy');

  tokenShow.addEventListener('click', function () {
    const hidden = tokenInput.type === 'password';
    tokenInput.type = hidden ? 'text' : 'password';
    tokenShow.textContent = hidden ? 'Скрий' : 'Покажи';
  });
  tokenCopy.addEventListener('click', async function () {
    const v = tokenInput.value.trim();
    if (!v) { flash(tokenCopy, 'Празно'); return; }
    if (await copyText(v)) { flash(tokenCopy, 'Копирано ✓'); return; }
    // Ако копирането е забранено — показваме и маркираме, за да се копира ръчно
    tokenInput.type = 'text';
    tokenShow.textContent = 'Скрий';
    tokenInput.focus();
    tokenInput.select();
    flash(tokenCopy, 'Копирайте ръчно');
  });

  // ----- Сейф -----
  const el = {
    warn: $('vaultWarn'), msg: $('vaultMsg'),
    setup: $('vaultSetup'), login: $('vaultLogin'), open: $('vaultOpen'),
    text: $('vaultText'), save: $('vaultSave'), copy: $('vaultCopy'),
    fromDevice: $('vaultFromDevice'), use: $('vaultUse'),
    passForm: $('vaultPassForm'), logout: $('vaultLogout')
  };

  function say(text, kind) {
    el.msg.textContent = text || '';
    el.msg.className = 'form-msg' + (kind ? ' is-' + kind : '');
  }

  function show(which) {
    el.setup.hidden = which !== 'setup';
    el.login.hidden = which !== 'login';
    el.open.hidden = which !== 'open';
  }

  async function call(action, data) {
    let res;
    try {
      res = await fetch(API, {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json', 'X-Kalendar': '1' },
        body: JSON.stringify(Object.assign({ action: action }, data || {}))
      });
    } catch (e) {
      return { ok: false, msg: 'Няма връзка със сървъра.' };
    }
    try {
      return await res.json();
    } catch (e) {
      return { ok: false, noPhp: true, msg: 'Сървърът не отговаря правилно. Сейфът изисква хостинг с PHP.' };
    }
  }

  let saved = '';
  function markDirty() {
    el.save.disabled = el.text.value === saved;
  }

  async function openVault() {
    const r = await call('get');
    if (!r.ok) { show('login'); say(r.msg, 'error'); return; }
    saved = r.text || '';
    el.text.value = saved;
    markDirty();
    const cfg = GitHub.getConfig();
    el.fromDevice.hidden = !(cfg && cfg.token);
    show('open');
  }

  async function init() {
    const insecure = location.protocol === 'http:' &&
      !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
    if (insecure) {
      el.warn.hidden = false;
      el.warn.textContent = 'Сайтът се отваря без https — паролата ще се изпраща незащитено. ' +
        'Включете SSL сертификат в хостинга и отворете адреса с https://.';
    }
    const r = await call('status');
    if (!r.ok) { show(null); say(r.msg, 'error'); return; }
    if (!r.configured) { show('setup'); return; }
    if (r.loggedIn) { await openVault(); return; }
    show('login');
  }

  el.setup.addEventListener('submit', async function (e) {
    e.preventDefault();
    const p1 = $('setupPass').value, p2 = $('setupPass2').value;
    if (p1 !== p2) { say('Двете пароли не съвпадат.', 'error'); return; }
    say('Създаване…');
    const r = await call('setup', { password: p1 });
    if (!r.ok) { say(r.msg, 'error'); if (r.msg && /вече/.test(r.msg)) show('login'); return; }
    el.setup.reset();
    say('Паролата е създадена. Поставете ключа и натиснете „Запази“.', 'ok');
    await openVault();
  });

  el.login.addEventListener('submit', async function (e) {
    e.preventDefault();
    const btn = el.login.querySelector('button');
    btn.disabled = true;
    say('Вход…');
    const r = await call('login', { password: $('loginPass').value });
    btn.disabled = false;
    if (!r.ok) { say(r.msg, 'error'); return; }
    el.login.reset();
    say('');
    await openVault();
  });

  el.text.addEventListener('input', markDirty);

  el.save.addEventListener('click', async function () {
    el.save.disabled = true;
    const value = el.text.value.trim();
    const r = await call('save', { text: value });
    if (!r.ok) { say(r.msg, 'error'); markDirty(); if (r.msg === 'Не сте влезли.') show('login'); return; }
    saved = value;
    el.text.value = value;
    markDirty();
    say('Записано в сейфа.', 'ok');
  });

  el.copy.addEventListener('click', async function () {
    const v = el.text.value.trim();
    if (!v) { flash(el.copy, 'Празно'); return; }
    if (await copyText(v)) { flash(el.copy, 'Копирано ✓'); return; }
    el.text.focus();
    el.text.select();
    flash(el.copy, 'Копирайте ръчно');
  });

  el.fromDevice.addEventListener('click', function () {
    const cfg = GitHub.getConfig();
    if (!cfg || !cfg.token) return;
    el.text.value = cfg.token;
    markDirty();
    say('Ключът от това устройство е поставен. Натиснете „Запази“.', 'ok');
  });

  // Намира ключа в текста (ако до него има и други бележки)
  function extractToken(text) {
    const m = /(github_pat_[A-Za-z0-9_]+|gh[pousr]_[A-Za-z0-9]+)/.exec(text);
    return m ? m[1] : text.trim();
  }

  el.use.addEventListener('click', function () {
    const t = extractToken(el.text.value);
    if (!t) { say('Сейфът е празен.', 'error'); return; }
    tokenInput.value = t;
    const form = $('settingsForm');
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const owner = $('owner'), repo = $('repo');
    const next = !owner.value.trim() ? owner : (!repo.value.trim() ? repo : $('saveBtn'));
    setTimeout(function () { next.focus({ preventScroll: true }); }, 400);
    $('formMsg').className = 'form-msg is-ok';
    $('formMsg').textContent = 'Ключът е поставен. Попълнете останалото и натиснете „Запази и провери“.';
  });

  el.passForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    const r = await call('password', { old: $('oldPass').value, new: $('newPass').value });
    if (!r.ok) { say(r.msg, 'error'); return; }
    el.passForm.reset();
    el.passForm.closest('details').open = false;
    say('Паролата е сменена.', 'ok');
  });

  el.logout.addEventListener('click', async function () {
    await call('logout');
    el.text.value = '';
    saved = '';
    show('login');
    say('Излязохте от сейфа.');
  });

  init();
})();
