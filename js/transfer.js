/*
 * settings.html:
 *  1) Бутони „Покажи“/„Копирай“ до полето за ключа.
 *  2) Прехвърляне на настройките (заедно с ключа) на друго устройство.
 *     Настройките се шифрират в браузъра (AES-GCM) със случаен код и се слагат
 *     в линк след знака # — тази част никога не се изпраща към сървъра.
 *     Кодът се показва само на екрана и се въвежда ръчно на другото устройство.
 */
(function () {
  const $ = function (id) { return document.getElementById(id); };

  // ----- Копиране (с резервен начин за по-стари браузъри) -----
  async function copyText(text) {
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

  // ----- 1) Покажи / Копирай ключа -----
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
    tokenInput.type = 'text';
    tokenShow.textContent = 'Скрий';
    tokenInput.focus();
    tokenInput.select();
    flash(tokenCopy, 'Копирайте ръчно');
  });

  // ----- 2) Прехвърляне -----
  const msg = $('transferMsg');
  function say(text, kind) {
    msg.textContent = text || '';
    msg.className = 'form-msg' + (kind ? ' is-' + kind : '');
  }

  const cryptoOk = !!(window.crypto && crypto.subtle && window.isSecureContext);

  // Код: 12 знака без лесни за объркване (без I, O, 0, 1) → около 60 бита случайност
  const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  function newCode() {
    const b = crypto.getRandomValues(new Uint8Array(12));
    let s = '';
    for (let i = 0; i < b.length; i++) s += ALPHA[b[i] & 31];
    return s.slice(0, 4) + '-' + s.slice(4, 8) + '-' + s.slice(8);
  }
  function normCode(c) {
    return String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  function toB64url(bytes) {
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function fromB64url(s) {
    s = s.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  async function deriveKey(code, salt) {
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(normCode(code)),
      'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: salt, iterations: 310000, hash: 'SHA-256' },
      base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }

  async function encryptConfig(cfg, code) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(code, salt);
    const data = new TextEncoder().encode(JSON.stringify({ v: 1, cfg: cfg }));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, data));
    const all = new Uint8Array(1 + 16 + 12 + ct.length);
    all[0] = 1;
    all.set(salt, 1);
    all.set(iv, 17);
    all.set(ct, 29);
    return toB64url(all);
  }

  async function decryptConfig(blob, code) {
    const all = fromB64url(blob);
    if (all[0] !== 1 || all.length < 30) throw new Error('format');
    const key = await deriveKey(code, all.slice(1, 17));
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: all.slice(17, 29) }, key, all.slice(29));
    const obj = JSON.parse(new TextDecoder().decode(plain));
    return obj.cfg;
  }

  // --- Създаване на линк ---
  const makeBtn = $('makeBtn');
  const makeHint = $('makeHint');
  const out = $('transferOut');
  let lastLink = '';

  function refreshMake() {
    const ok = GitHub.isConfigured();
    makeBtn.disabled = !ok || !cryptoOk;
    if (!cryptoOk) makeHint.textContent = 'Прехвърлянето изисква сайтът да е отворен с https://.';
    else if (!ok) makeHint.textContent = 'Първо настройте синхронизацията по-долу. После ще можете да я прехвърлите на друго устройство.';
    else makeHint.textContent = 'Натиснете тук, на устройството, където синхронизацията вече работи.';
  }

  makeBtn.addEventListener('click', async function () {
    const cfg = GitHub.getConfig();
    if (!cfg) { refreshMake(); return; }
    makeBtn.disabled = true;
    say('Подготвяне…');
    try {
      const code = newCode();
      const blob = await encryptConfig(cfg, code);
      lastLink = location.origin + location.pathname + '#import=' + blob;
      const qr = qrcode(0, 'M');
      qr.addData(lastLink);
      qr.make();
      $('qrBox').innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
      $('unlockCode').textContent = code;
      out.hidden = false;
      makeBtn.textContent = 'Създай нов линк';
      say('');
    } catch (e) {
      say('Не успях да създам линка: ' + e.message, 'error');
    }
    makeBtn.disabled = false;
  });

  $('copyLink').addEventListener('click', async function () {
    if (lastLink && await copyText(lastLink)) flash($('copyLink'), 'Копирано ✓');
    else flash($('copyLink'), 'Не успях');
  });

  // --- Получаване ---
  const importForm = $('transferImport');
  const m = /^#import=([A-Za-z0-9_-]+)$/.exec(location.hash);
  const blob = m ? m[1] : null;

  if (blob) {
    importForm.hidden = false;
    $('transferMake').hidden = true;
    if (!cryptoOk) say('Отворете линка с https://, иначе не може да се отключи.', 'error');
    setTimeout(function () {
      $('transfer').scrollIntoView({ block: 'start' });
      $('importCode').focus({ preventScroll: true });
    }, 200);
  }

  importForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    const btn = importForm.querySelector('button');
    btn.disabled = true;
    say('Отключване…');
    let cfg;
    try {
      cfg = await decryptConfig(blob, $('importCode').value);
    } catch (err) {
      btn.disabled = false;
      say('Кодът не е верен. Проверете го и опитайте отново.', 'error');
      return;
    }
    if (!cfg || !cfg.owner || !cfg.repo || !cfg.token) {
      btn.disabled = false;
      say('Линкът е повреден. Създайте нов на другото устройство.', 'error');
      return;
    }
    GitHub.setConfig(cfg);
    // Попълваме формата по-долу, за да се виждат настройките
    $('owner').value = cfg.owner;
    $('repo').value = cfg.repo;
    $('token').value = cfg.token;
    $('branch').value = cfg.branch || 'main';
    $('path').value = cfg.path || 'events.json';
    $('forgetBtn').hidden = false;
    history.replaceState(null, '', location.pathname + location.search);
    importForm.hidden = true;
    $('transferMake').hidden = false;
    refreshMake();
    say('Настройките са приложени. Синхронизиране…', 'ok');
    await Storage.sync();
    if (Storage.getStatus() === 'ok') say('Готово! Това устройство вече вижда същите събития.', 'ok');
    else say('Настройките са записани, но синхронизацията не успя. Проверете интернета и опитайте пак.', 'error');
  });

  // Бутонът става активен веднага щом синхронизацията се настрои
  Storage.onChange(function (what) { if (what === 'status') refreshMake(); });
  refreshMake();
})();
