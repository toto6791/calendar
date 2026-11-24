/*
 * Връзка с GitHub: чете и записва файла със събитията (events.json)
 * в частно хранилище чрез GitHub API.
 * Настройките и ключът се пазят само на това устройство.
 */
const GitHub = (function () {
  const KEY = 'kalendar-github';
  const API = 'https://api.github.com';

  function getConfig() {
    try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch (e) { return null; }
  }
  function setConfig(c) { localStorage.setItem(KEY, JSON.stringify(c)); }
  function clearConfig() { localStorage.removeItem(KEY); }
  function isConfigured() {
    const c = getConfig();
    return !!(c && c.owner && c.repo && c.token);
  }

  // Текст (UTF-8, с кирилица) <-> base64
  function toBase64(text) {
    const bytes = new TextEncoder().encode(text);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(bin);
  }
  function fromBase64(b64) {
    const bin = atob(b64.replace(/\s/g, ''));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  function makeError(status) {
    const e = new Error('GitHub ' + status);
    e.status = status;
    e.auth = status === 401 || status === 403;
    e.notFound = status === 404;
    e.conflict = status === 409 || status === 422;
    return e;
  }

  async function request(cfg, path, method, body) {
    let res;
    try {
      res = await fetch(API + path, {
        method: method || 'GET',
        cache: 'no-store',
        headers: Object.assign({
          'Accept': 'application/vnd.github+json',
          'Authorization': 'Bearer ' + cfg.token,
          'X-GitHub-Api-Version': '2022-11-28'
        }, body ? { 'Content-Type': 'application/json' } : {}),
        body: body ? JSON.stringify(body) : undefined
      });
    } catch (e) {
      const err = new Error('Няма връзка');
      err.offline = true;
      throw err;
    }
    return res;
  }

  function repoPath(cfg) {
    return '/repos/' + encodeURIComponent(cfg.owner) + '/' + encodeURIComponent(cfg.repo);
  }
  function filePath(cfg) {
    return repoPath(cfg) + '/contents/' + cfg.path.split('/').map(encodeURIComponent).join('/');
  }

  // Чете файла. Ако го няма — връща празни данни (ще бъде създаден при запис).
  async function readFile() {
    const cfg = getConfig();
    const res = await request(cfg, filePath(cfg) + '?ref=' + encodeURIComponent(cfg.branch));
    if (res.status === 404) return { data: null, sha: null };
    if (!res.ok) throw makeError(res.status);
    const json = await res.json();
    let data = null;
    try { data = JSON.parse(fromBase64(json.content || '')); } catch (e) { data = null; }
    return { data: data, sha: json.sha };
  }

  // Записва файла. sha е версията, която сме прочели — ако междувременно
  // друго устройство е записало, GitHub връща конфликт и опитваме отново.
  async function writeFile(data, sha, message) {
    const cfg = getConfig();
    const body = {
      message: message || 'Календар: промяна',
      content: toBase64(JSON.stringify(data, null, 2) + '\n'),
      branch: cfg.branch
    };
    if (sha) body.sha = sha;
    const res = await request(cfg, filePath(cfg), 'PUT', body);
    if (!res.ok) throw makeError(res.status);
    const json = await res.json();
    return json.content.sha;
  }

  // Проверка на настройките (използва се в settings.html)
  async function check(cfg) {
    const res = await request(cfg, repoPath(cfg));
    if (res.status === 401) return { ok: false, msg: 'Ключът не е валиден или е изтекъл.' };
    if (res.status === 404 || res.status === 403) {
      return { ok: false, msg: 'Хранилището не е намерено или ключът няма достъп до него. Проверете името и правата на ключа.' };
    }
    if (!res.ok) return { ok: false, msg: 'GitHub върна грешка ' + res.status + '.' };
    const repo = await res.json();
    if (repo.permissions && repo.permissions.push === false) {
      return { ok: false, msg: 'Ключът може само да чете. Дайте му право „Contents: Read and write“.' };
    }
    return { ok: true, isPrivate: !!repo.private };
  }

  return {
    getConfig: getConfig, setConfig: setConfig, clearConfig: clearConfig,
    isConfigured: isConfigured, readFile: readFile, writeFile: writeFile, check: check
  };
})();
