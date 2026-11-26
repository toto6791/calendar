<?php
/*
 * Сейф за ключа.
 *  - Вход с парола (паролата се пази само като hash).
 *  - Записаният текст се шифрира с ключ, получен от паролата (AES-256-GCM),
 *    така че дори някой да вземе файла private/vault.json, не може да го прочете без паролата.
 *  - Данните са в папка private/, до която браузърът няма достъп (.htaccess).
 * Работи с PHP 7.1 или по-нов.
 */

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

$DIR = dirname(__DIR__) . '/private';
$VAULT = $DIR . '/vault.json';
$ATTEMPTS = $DIR . '/attempts.json';
$MAX_FAILS = 5;        // грешни опита...
$LOCK_SECONDS = 600;   // ...и блокиране за 10 минути
$MIN_PASS = 8;
$MAX_TEXT = 10000;

function out($data, $code = 200) {
  http_response_code($code);
  echo json_encode($data, JSON_UNESCAPED_UNICODE);
  exit;
}
function fail($msg, $code = 400) { out(array('ok' => false, 'msg' => $msg), $code); }
function textLen($s) { return function_exists('mb_strlen') ? mb_strlen($s, 'UTF-8') : strlen($s); }

// Само POST от нашите страници (собственото заглавие спира заявки от други сайтове)
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST' || ($_SERVER['HTTP_X_KALENDAR'] ?? '') !== '1') {
  fail('Невалидна заявка.', 405);
}
if (!function_exists('openssl_encrypt') || !in_array('aes-256-gcm', openssl_get_cipher_methods(), true)) {
  fail('Сървърът няма нужното шифриране (OpenSSL). Нужен е PHP 7.1+ с OpenSSL.', 500);
}

// ----- Файлове -----
function ensureDir($dir) {
  if (!is_dir($dir)) @mkdir($dir, 0700, true);
  if (!file_exists($dir . '/.htaccess')) {
    @file_put_contents($dir . '/.htaccess',
      "<IfModule mod_authz_core.c>\n  Require all denied\n</IfModule>\n<IfModule !mod_authz_core.c>\n  Deny from all\n</IfModule>\n");
  }
}
function readJson($path) {
  if (!is_file($path)) return null;
  $d = json_decode((string)@file_get_contents($path), true);
  return is_array($d) ? $d : null;
}
function writeJson($path, $data) {
  ensureDir(dirname($path));
  $tmp = $path . '.tmp';
  if (@file_put_contents($tmp, json_encode($data, JSON_PRETTY_PRINT), LOCK_EX) === false || !@rename($tmp, $path)) {
    fail('Не мога да запиша във папка private/. Проверете правата ѝ (напр. 755).', 500);
  }
  @chmod($path, 0600);
}

// ----- Шифриране -----
function deriveKey($pass, $salt) { return hash_pbkdf2('sha256', $pass, $salt, 150000, 32, true); }
function encryptText($text, $key) {
  $iv = random_bytes(12);
  $tag = '';
  $ct = openssl_encrypt($text, 'aes-256-gcm', $key, OPENSSL_RAW_DATA, $iv, $tag);
  return base64_encode($iv . $tag . $ct);
}
function decryptText($blob, $key) {
  $raw = base64_decode((string)$blob, true);
  if ($raw === false || strlen($raw) < 28) return null;
  $res = openssl_decrypt(substr($raw, 28), 'aes-256-gcm', $key, OPENSSL_RAW_DATA, substr($raw, 0, 12), substr($raw, 12, 16));
  return $res === false ? null : $res;
}

// ----- Сесия -----
$https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
  || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
$cookiePath = rtrim(dirname(dirname($_SERVER['SCRIPT_NAME'])), '/\\') . '/';
session_name('kalendar_vault');
if (PHP_VERSION_ID >= 70300) {
  session_set_cookie_params(array('lifetime' => 0, 'path' => $cookiePath, 'secure' => $https, 'httponly' => true, 'samesite' => 'Strict'));
} else {
  session_set_cookie_params(0, $cookiePath . '; samesite=Strict', '', $https, true);
}
ini_set('session.use_strict_mode', '1');
session_start();

function loggedInKey() {
  if (empty($_SESSION['vault_key'])) return null;
  $k = base64_decode($_SESSION['vault_key'], true);
  return ($k !== false && strlen($k) === 32) ? $k : null;
}
function requireLogin() {
  $k = loggedInKey();
  if (!$k) fail('Не сте влезли.', 401);
  return $k;
}
function startSession($key) {
  session_regenerate_id(true);
  $_SESSION['vault_key'] = base64_encode($key);
}

// ----- Защита от налучкване на паролата -----
function clientIp() { return $_SERVER['REMOTE_ADDR'] ?? 'unknown'; }
function lockedFor($file) {
  $a = readJson($file) ?: array();
  $r = $a[clientIp()] ?? null;
  return ($r && ($r['until'] ?? 0) > time()) ? ($r['until'] - time()) : 0;
}
function recordFail($file, $max, $lock) {
  $a = readJson($file) ?: array();
  $now = time();
  foreach ($a as $ip => $r) { if (($r['until'] ?? 0) < $now && ($r['last'] ?? 0) < $now - 86400) unset($a[$ip]); }
  $r = $a[clientIp()] ?? array('count' => 0, 'until' => 0);
  $r['count'] = ($r['count'] ?? 0) + 1;
  $r['last'] = $now;
  if ($r['count'] >= $max) { $r['until'] = $now + $lock; $r['count'] = 0; }
  $a[clientIp()] = $r;
  writeJson($file, $a);
}
function clearFails($file) {
  $a = readJson($file);
  if ($a && isset($a[clientIp()])) { unset($a[clientIp()]); writeJson($file, $a); }
}

// ----- Заявка -----
$in = json_decode((string)file_get_contents('php://input'), true);
if (!is_array($in)) $in = array();
$action = (string)($in['action'] ?? '');
$vault = readJson($VAULT);

switch ($action) {
  case 'status':
    out(array('ok' => true, 'configured' => (bool)$vault, 'loggedIn' => (bool)($vault && loggedInKey()), 'https' => $https));

  case 'setup':
    if ($vault) fail('Паролата вече е създадена. Влезте с нея.', 409);
    $pass = (string)($in['password'] ?? '');
    if (textLen($pass) < $MIN_PASS) fail('Паролата трябва да е поне ' . $MIN_PASS . ' знака.');
    $salt = random_bytes(16);
    $key = deriveKey($pass, $salt);
    writeJson($VAULT, array(
      'version' => 1,
      'hash' => password_hash($pass, PASSWORD_DEFAULT),
      'salt' => base64_encode($salt),
      'secret' => encryptText('', $key)
    ));
    startSession($key);
    out(array('ok' => true));

  case 'login':
    if (!$vault) fail('Още няма създадена парола.', 409);
    $wait = lockedFor($ATTEMPTS);
    if ($wait) fail('Твърде много грешни опити. Опитайте след ' . ceil($wait / 60) . ' мин.', 429);
    $pass = (string)($in['password'] ?? '');
    if (!password_verify($pass, $vault['hash'])) {
      recordFail($ATTEMPTS, $MAX_FAILS, $LOCK_SECONDS);
      sleep(1);
      fail('Грешна парола.', 401);
    }
    clearFails($ATTEMPTS);
    startSession(deriveKey($pass, base64_decode($vault['salt'])));
    out(array('ok' => true));

  case 'logout':
    $_SESSION = array();
    session_destroy();
    out(array('ok' => true));

  case 'get':
    if (!$vault) fail('Още няма създадена парола.', 409);
    $text = decryptText($vault['secret'], requireLogin());
    if ($text === null) fail('Не мога да разчета записа. Влезте отново.', 401);
    out(array('ok' => true, 'text' => $text));

  case 'save':
    if (!$vault) fail('Още няма създадена парола.', 409);
    $key = requireLogin();
    $text = (string)($in['text'] ?? '');
    if (strlen($text) > $MAX_TEXT) fail('Текстът е твърде дълъг.');
    $vault['secret'] = encryptText($text, $key);
    writeJson($VAULT, $vault);
    out(array('ok' => true));

  case 'password':
    if (!$vault) fail('Още няма създадена парола.', 409);
    $oldKey = requireLogin();
    $old = (string)($in['old'] ?? '');
    $new = (string)($in['new'] ?? '');
    if (!password_verify($old, $vault['hash'])) { sleep(1); fail('Старата парола е грешна.', 401); }
    if (textLen($new) < $MIN_PASS) fail('Новата парола трябва да е поне ' . $MIN_PASS . ' знака.');
    $text = decryptText($vault['secret'], $oldKey);
    if ($text === null) fail('Не мога да разчета записа. Влезте отново.', 401);
    $salt = random_bytes(16);
    $key = deriveKey($new, $salt);
    $vault['hash'] = password_hash($new, PASSWORD_DEFAULT);
    $vault['salt'] = base64_encode($salt);
    $vault['secret'] = encryptText($text, $key);
    writeJson($VAULT, $vault);
    startSession($key);
    out(array('ok' => true));

  default:
    fail('Непозната заявка.');
}
