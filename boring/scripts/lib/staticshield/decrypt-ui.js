(function () {
  'use strict';
  var C = window.StaticShieldCrypto, data = window.SS_DATA, REMEMBER_DAYS = window.SS_REMEMBER_DAYS || 0;
  function $(id) { return document.getElementById(id); }
  var card = $('ss-card'), pwdEl = $('ss-pwd'), errEl = $('ss-error'), unlockBtn = $('ss-unlock'), toggleBtn = $('ss-toggle'), rememberEl = $('ss-remember');
  if (!C || !data || !card || !pwdEl || !unlockBtn) {
    if (card) card.innerHTML = '<p style="color:#8b0000">加密运行时初始化失败，文件可能已损坏。</p>';
    return;
  }
  if (!window.crypto || !window.crypto.subtle) {
    card.innerHTML = '<p style="color:#8b0000">当前为非安全上下文（纯 HTTP），WebCrypto 不可用。请通过 HTTPS 或本地 file:// 打开本页面。</p>';
    return;
  }
  function rememberKey() { return 'staticshield_rm_' + data.salt; }
  function validIter(n) { return typeof n === 'number' && n >= 100000 && n <= 10000000 && Math.floor(n) === n; }
  function showError(msg) {
    errEl.textContent = msg; errEl.hidden = false;
    card.classList.remove('ss-shake'); void card.offsetWidth; card.classList.add('ss-shake'); pwdEl.focus();
  }
  function clearError() { if (!errEl.hidden) errEl.hidden = true; }
  function setLoading(on) { unlockBtn.disabled = on; unlockBtn.textContent = on ? '解锁中…' : '解锁'; }
  function getHashPassword() { var h = location.hash || '', m = h.match(/[#&]pwd=([^&]*)/); return m ? decodeURIComponent(m[1]) : null; }
  function clearHashIfNeeded() { if (location.hash && /pwd=/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search); }
  function replaceDocument(html) {
    var doc = new DOMParser().parseFromString(html, 'text/html');
    document.replaceChild(doc.documentElement, document.documentElement);
    var scripts = document.querySelectorAll('script');
    for (var i = 0; i < scripts.length; i++) {
      var s = scripts[i], ns = document.createElement('script');
      for (var a = 0; a < s.attributes.length; a++) ns.setAttribute(s.attributes[a].name, s.attributes[a].value);
      if (s.src) ns.src = s.src; else ns.textContent = s.textContent;
      s.parentNode.replaceChild(ns, s);
    }
  }
  async function decryptWithPassword(password) {
    if (!validIter(data.iter)) throw new Error('BAD_META');
    var useSha512 = data.kdf === 'PBKDF2-SHA512';
    var bits = await C.deriveBitsFromPassword(password, C.b64decode(data.salt), data.iter, useSha512);
    var keys = await C.importKeys(bits);
    return { bits: bits, html: await C.decryptWithKeys(data, keys.encKey, keys.macKey) };
  }
  async function decryptWithBits(bits) {
    if (!validIter(data.iter)) throw new Error('BAD_META');
    var keys = await C.importKeys(bits);
    return C.decryptWithKeys(data, keys.encKey, keys.macKey);
  }
  async function unlock(password, remember) {
    if (!password) { showError('请输入密码'); return; }
    setLoading(true); clearError();
    try {
      var r = await decryptWithPassword(password);
      if (remember && REMEMBER_DAYS >= 0) {
        try { var exp = REMEMBER_DAYS === 0 ? 0 : Date.now() + REMEMBER_DAYS * 86400000; localStorage.setItem(rememberKey(), JSON.stringify({ bits: C.b64encode(r.bits), exp: exp })); } catch (e) {}
      }
      clearHashIfNeeded(); replaceDocument(r.html);
    } catch (e) { showError('密码错误或文件已损坏'); } finally { setLoading(false); }
  }
  function tryRestoreBits() {
    try {
      var raw = localStorage.getItem(rememberKey()); if (!raw) return null;
      var obj = JSON.parse(raw);
      if (obj.exp !== 0 && Date.now() > obj.exp) { localStorage.removeItem(rememberKey()); return null; }
      return C.b64decode(obj.bits);
    } catch (e) { return null; }
  }
  var EYE_OPEN = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
  var EYE_CLOSED = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
  toggleBtn.innerHTML = EYE_OPEN;
  toggleBtn.addEventListener('click', function () {
    var show = pwdEl.type === 'password';
    pwdEl.type = show ? 'text' : 'password';
    toggleBtn.innerHTML = show ? EYE_CLOSED : EYE_OPEN;
    toggleBtn.setAttribute('aria-label', show ? '隐藏密码' : '显示密码');
    pwdEl.focus();
  });
  function onSubmit() { unlock(pwdEl.value, rememberEl ? rememberEl.checked : false); }
  unlockBtn.addEventListener('click', onSubmit);
  pwdEl.addEventListener('keydown', function (e) { if (e.key === 'Enter') onSubmit(); });
  pwdEl.addEventListener('input', clearError);
  (async function init() {
    var hashPwd = getHashPassword();
    if (hashPwd) {
      setLoading(true);
      try { var r = await decryptWithPassword(hashPwd); clearHashIfNeeded(); replaceDocument(r.html); return; }
      catch (e) { setLoading(false); clearHashIfNeeded(); showError('链接密码无效，请手动输入'); pwdEl.focus(); return; }
    }
    var bits = tryRestoreBits();
    if (bits) {
      setLoading(true);
      try { var html = await decryptWithBits(bits); replaceDocument(html); return; }
      catch (e) { setLoading(false); try { localStorage.removeItem(rememberKey()); } catch (e2) {} }
    }
    pwdEl.focus();
  })();
})();
