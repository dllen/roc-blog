(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.StaticShieldRender = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function safeForScript(raw) {
    return String(raw).replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');
  }
  var LS = String.fromCharCode(0x2028), PS = String.fromCharCode(0x2029);
  function safeJson(obj) {
    return JSON.stringify(obj).replace(/</g, '\\u003c').split(LS).join('\\u2028').split(PS).join('\\u2029');
  }

  var CSS = [
    '*,*::before,*::after{box-sizing:border-box}',
    'html,body{margin:0;padding:0}',
    'body{min-height:100vh;display:flex;align-items:center;justify-content:center;background:#ddcdef;color:#3a2a5c;padding:20px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif}',
    '.ss-wrap{width:100%;max-width:420px}',
    '.ss-card{background:#fff;border-radius:16px;padding:36px 32px;text-align:center;box-shadow:0 20px 60px rgba(80,40,140,.18)}',
    '.ss-logo{max-width:64px;max-height:64px;margin:0 auto 12px;display:block;border-radius:10px;object-fit:contain}',
    '.ss-h1{font-size:20px;margin:6px 0 4px;color:#4a2d80}',
    '.ss-sub{margin:0 0 20px;color:#7a6a96;font-size:14px}',
    '.ss-inputrow{display:flex;gap:8px;margin-bottom:14px}',
    '.ss-input{flex:1;min-width:0;padding:12px 14px;border:1.5px solid #d9c9f0;border-radius:10px;font-size:16px;background:#fbf8ff;color:#3a2a5c;outline:none;transition:border-color .15s,box-shadow .15s}',
    '.ss-input:focus{border-color:#9932cc;box-shadow:0 0 0 3px rgba(153,50,204,.15)}',
    '.ss-toggle{flex:0 0 auto;background:#f0e8fa;border:1.5px solid #d9c9f0;border-radius:10px;padding:0 14px;font-size:16px;cursor:pointer;color:#7a6a96}',
    '.ss-toggle:hover{background:#e4d6f5}',
    '.ss-hint{margin:-4px 0 14px;color:#6a5a86;font-size:13px;word-break:break-all}',
    '.ss-remember{display:flex;align-items:center;justify-content:center;gap:6px;margin:0 0 16px;font-size:13px;color:#7a6a96;cursor:pointer}',
    '.ss-remember input{margin:0}',
    '.ss-tip{color:#7a6a96;font-size:12px}',
    '.ss-btn{width:100%;padding:13px;border:none;border-radius:10px;background:#9932cc;color:#fff;font-size:15px;font-weight:600;cursor:pointer;transition:background .15s,transform .05s}',
    '.ss-btn:hover:not(:disabled){background:#8327b3}',
    '.ss-btn:active:not(:disabled){transform:translateY(1px)}',
    '.ss-btn:disabled{opacity:.6;cursor:not-allowed}',
    '.ss-error{margin:14px 0 0;color:#8b0000;font-size:14px;background:#fbeeee;border:1px solid #e8cccc;border-radius:8px;padding:8px;word-break:break-all}',
    '.ss-foot{margin:18px 0 0;font-size:12px;color:#7a6a96;text-align:center}',
    '.ss-foot a{display:inline-flex;align-items:center;gap:5px;color:#9932cc;font-weight:600;text-decoration:none}',
    '.ss-foot a svg{fill:currentColor}',
    '.ss-foot a:hover{text-decoration:underline}',
    '.ss-sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}',
    '.ss-shake{animation:ss-shake .42s}',
    '@keyframes ss-shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-8px)}40%{transform:translateX(8px)}60%{transform:translateX(-6px)}80%{transform:translateX(6px)}}',
    '@media (prefers-reduced-motion:reduce){.ss-shake{animation:none}}'
  ].join('\n');

  function renderEncryptedHtml(meta, coreSrc, uiSrc) {
    var logoHtml = meta.logo ? '<img class="ss-logo" src="' + escapeHtml(meta.logo) + '" alt="">' : '';
    var hintHtml = meta.hint ? '<p class="ss-hint">提示：' + escapeHtml(meta.hint) + '</p>' : '';
    var hasRemember = typeof meta.rememberDays === 'number';
    var rememberLabel = hasRemember ? (meta.rememberDays === 0 ? '永久' : meta.rememberDays + ' 天') : '';
    var rememberHtml = hasRemember
      ? '<label class="ss-remember"><input type="checkbox" id="ss-remember"> 记住我（本机 ' + rememberLabel + '）<span class="ss-tip">· 公共设备勿勾选</span></label>'
      : '';
    return [
      '<!DOCTYPE html><html lang="zh-CN"><head>',
      '<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">',
      '<meta name="robots" content="noindex, nofollow"><meta name="referrer" content="no-referrer">',
      '<meta http-equiv="Content-Security-Policy" content="default-src \'self\' data: blob:; img-src data: blob: http: https:; media-src data: blob: http: https:; style-src \'unsafe-inline\'; script-src \'unsafe-inline\'; connect-src \'self\'; base-uri \'none\'; form-action \'self\'">',
      '<title>该网页已由StaticShield加密保护</title><style>', CSS, '</style></head><body>',
      '<main class="ss-wrap"><div id="ss-card" class="ss-card">',
      logoHtml,
      '<h1 class="ss-h1">该网页已加密保护</h1><p class="ss-sub">请输入密码以查看内容</p>',
      '<div class="ss-inputrow">',
      '<label for="ss-pwd" class="ss-sr-only">密码</label>',
      '<input type="password" id="ss-pwd" class="ss-input" placeholder="请输入密码" autocomplete="off" spellcheck="false" autocapitalize="off" aria-describedby="ss-error">',
      '<button id="ss-toggle" type="button" class="ss-toggle" aria-label="显示密码"></button>',
      '</div>',
      hintHtml, rememberHtml,
      '<button id="ss-unlock" type="button" class="ss-btn">解锁</button>',
      '<p id="ss-error" class="ss-error" role="alert" hidden></p>',
      '<p class="ss-foot"><a href="https://github.com/wangshengithub/staticshield" target="_blank" rel="noopener noreferrer"><svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true"><path fill="currentColor" d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg> 由 StaticShield 加密保护</a>',
      '</p>',
      '</div></main>',
      '<script>', safeForScript(coreSrc), '</script>',
      '<script>window.SS_DATA = ' + safeJson(meta) + ';',
      'window.SS_REMEMBER_DAYS = ' + (hasRemember ? meta.rememberDays : 0) + ';',
      safeForScript(uiSrc), '</script></body></html>'
    ].join('\n');
  }

  return { renderEncryptedHtml: renderEncryptedHtml, CSS: CSS, escapeHtml: escapeHtml };
});
