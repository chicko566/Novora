export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const CSS = `
:root{
  --bg:#0D1117; --panel:#161D27; --panel2:#1D2532; --line:#253041;
  --text:#E9EFF7; --muted:#7E8FA6; --accent:#22D3EE; --accent-dim:rgba(34,211,238,.16);
  --good:#34D399; --warn:#F59E0B; --bad:#F87171;
}
*{box-sizing:border-box}
html,body{height:100%}
body{margin:0;background:var(--bg);color:var(--text);
  font:14px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif}
a{color:var(--accent);text-decoration:none}
a:hover{text-decoration:underline}
code,.mono{font-family:ui-monospace,SFMono-Regular,Consolas,"Courier New",monospace}
.wrap{max-width:1180px;margin:0 auto;padding:0 20px}
header.top{background:var(--panel2);border-bottom:1px solid var(--line)}
header.top .wrap{display:flex;align-items:center;gap:22px;min-height:56px;flex-wrap:wrap}
.brand{font-weight:700;letter-spacing:.04em;font-size:15px}
.brand span{color:var(--accent)}
nav.main{display:flex;gap:4px;flex-wrap:wrap}
nav.main a{padding:7px 12px;border-radius:7px;color:var(--muted)}
nav.main a:hover{background:var(--panel);color:var(--text);text-decoration:none}
nav.main a.active{background:var(--accent-dim);color:var(--accent)}
.spacer{flex:1}
.userbox{display:flex;align-items:center;gap:10px;color:var(--muted);font-size:13px}
main{padding:26px 0 60px}
h1{font-size:21px;margin:0 0 4px}
h2{font-size:15px;margin:26px 0 10px;color:#c9d5e3}
p.lead{color:var(--muted);margin:0 0 20px}
.panel{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:18px 20px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:14px}
.stat .k{color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.08em}
.stat .v{font-size:28px;font-weight:650;margin-top:2px}
.stat .s{color:var(--muted);font-size:12px}
table{width:100%;border-collapse:collapse;font-size:13px}
.table-wrap{overflow-x:auto}
th,td{text-align:left;padding:9px 10px;border-bottom:1px solid var(--line);vertical-align:top}
th{color:var(--muted);font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.07em;white-space:nowrap}
tbody tr:hover{background:#141b25}
.badge{display:inline-block;padding:2px 8px;border-radius:999px;font-size:11.5px;border:1px solid transparent;white-space:nowrap}
.badge.active{color:var(--good);border-color:#1d4429;background:#0f2317}
.badge.revoked{color:var(--bad);border-color:#4a1c19;background:#28100f}
.badge.expired{color:var(--warn);border-color:#453314;background:#221a0b}
.badge.neutral{color:var(--muted);border-color:var(--line);background:var(--panel2)}
.muted{color:var(--muted)}
.small{font-size:12px}
form.inline{display:inline}
label{display:block;font-size:12.5px;color:var(--muted);margin:0 0 5px}
input,select,textarea{width:100%;padding:9px 11px;border-radius:8px;border:1px solid var(--line);
  background:var(--panel2);color:var(--text);font:inherit;font-size:13.5px}
input:focus,select:focus,textarea:focus{outline:2px solid var(--accent-dim);border-color:var(--accent)}
textarea{min-height:120px;resize:vertical}
.field{margin-bottom:14px}
.row{display:flex;gap:14px;flex-wrap:wrap}
.row .field{flex:1;min-width:180px;margin-bottom:0}
.actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:16px}
button,.btn{display:inline-block;padding:9px 15px;border-radius:8px;border:1px solid var(--line);
  background:#172231;color:var(--text);font:inherit;font-size:13.5px;cursor:pointer}
button:hover,.btn:hover{background:#1d2b3d;text-decoration:none}
input[type="checkbox"]{width:auto;padding:0;accent-color:var(--accent);cursor:pointer}
.divider{display:flex;align-items:center;gap:12px;color:var(--muted);font-size:12px;margin:18px 0}
.divider::before,.divider::after{content:"";flex:1;height:1px;background:var(--line)}
.hint{color:var(--muted);font-size:12px;margin:10px 0 0}
.bulk-bar{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-top:14px}
button.primary{background:var(--accent);border-color:var(--accent);color:#04101f;font-weight:600}
button.primary:hover{background:#38E0FA}
button:disabled{opacity:.45;cursor:not-allowed}
button.danger{color:#ffb4ae;border-color:#4a1c19;background:#241110}
button.danger:hover{background:#311512}
button.ghost{background:transparent}
.notice{padding:11px 14px;border-radius:9px;margin:0 0 18px;font-size:13.5px;border:1px solid var(--line)}
.notice.ok{color:#9ff0b2;border-color:#1d4429;background:#0f2317}
.notice.err{color:#ffb4ae;border-color:#4a1c19;background:#28100f}
.notice.info{color:#bcd9ff;border-color:#1c3555;background:#0d1a2b}
pre.keys{background:var(--panel2);border:1px solid var(--line);border-radius:9px;padding:14px;
  overflow-x:auto;font-family:ui-monospace,Consolas,monospace;font-size:13px;line-height:1.9}
.login-shell{min-height:100vh;display:grid;place-items:center;padding:24px}
.login-card{width:100%;max-width:390px;background:var(--panel);border:1px solid var(--line);
  border-radius:14px;padding:28px}
.login-card h1{font-size:19px}
.login-card .brand{margin-bottom:18px}
.kv{display:grid;grid-template-columns:190px 1fr;gap:8px 18px;font-size:13.5px}
.kv dt{color:var(--muted)}
.kv dd{margin:0}
section.block{margin-top:24px}
footer{color:var(--muted);font-size:12px;padding:24px 0;border-top:1px solid var(--line);margin-top:40px}
`;

// CSP fuer Admin-Seiten: erlaubt eigene Module (Passkey-Bundle) und fetch() auf eigenen Origin.
// Wird von adminRoutes per Header gesetzt (http.mjs bleibt unveraendert).
export const HTML_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; script-src 'self'; " +
  "connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'";

export function cspMeta() {
  return `<meta http-equiv="Content-Security-Policy" content="${esc(HTML_CSP)}">`;
}

function flashHtml(notice) {
  if (!notice) return '';
  const kinds = { ok: 'ok', err: 'err', info: 'info' };
  const kind = kinds[notice.kind] ?? 'info';
  return `<div class="notice ${kind}">${esc(notice.text)}</div>`;
}

function scriptsHtml(scripts) {
  const list = (Array.isArray(scripts) ? scripts : scripts ? [scripts] : []).filter(Boolean);
  if (!list.length) return '';
  return list
    .map((src) => `<script type="module" src="${esc(src)}"></script>`)
    .join('\n');
}

export function page({ title, active = '', user = null, csrf = '', body = '', notice = null, wide = false, scripts = [] }) {
  const nav = user
    ? `<nav class="main">
        <a href="/admin/dashboard" class="${active === 'dashboard' ? 'active' : ''}">Dashboard</a>
        <a href="/admin/keys" class="${active === 'keys' ? 'active' : ''}">Schlüssel</a>
        <a href="/admin/keys/new" class="${active === 'new' ? 'active' : ''}">Neu</a>
        <a href="/admin/audit" class="${active === 'audit' ? 'active' : ''}">Audit</a>
        <a href="/admin/security" class="${active === 'security' ? 'active' : ''}">Sicherheit</a>
      </nav>`
    : '';
  const userbox = user
    ? `<div class="userbox">
        <span>${esc(user.email)}</span>
        <form class="inline" method="post" action="/admin/logout">
          <input type="hidden" name="_csrf" value="${esc(csrf)}">
          <button class="ghost" type="submit">Abmelden</button>
        </form>
      </div>`
    : '';
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} - Novora Lizenzen</title>
<style>${CSS}</style>
</head>
<body>
<header class="top"><div class="wrap">
  <div class="brand">NOVORA <span>/ Lizenzserver</span></div>
  ${nav}
  <div class="spacer"></div>
  ${userbox}
</div></header>
<main><div class="wrap"${wide ? '' : ''}>
${flashHtml(notice)}
${body}
</div></main>
<footer><div class="wrap">Novora Lizenzserver &middot; internal</div></footer>
${scriptsHtml(scripts)}
</body>
</html>`;
}

export function authPage({ title, body, notice = null, scripts = [] }) {
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} - Novora Lizenzen</title>
<style>${CSS}</style>
</head>
<body>
<div class="login-shell"><div class="login-card">
  <div class="brand">NOVORA <span>/ Lizenzserver</span></div>
  ${flashHtml(notice)}
  ${body}
</div></div>
${scriptsHtml(scripts)}
</body>
</html>`;
}

export function badgeForStatus(status, expiresAt, now = Date.now()) {
  if (status === 'revoked') return '<span class="badge revoked">gesperrt</span>';
  if (expiresAt && expiresAt <= now) return '<span class="badge expired">abgelaufen</span>';
  return '<span class="badge active">aktiv</span>';
}

export function csrfField(csrf) {
  return `<input type="hidden" name="_csrf" value="${esc(csrf)}">`;
}

export function noticeFromQuery(url) {
  const ok = url.searchParams.get('ok');
  const err = url.searchParams.get('err');
  if (ok) return { kind: 'ok', text: ok };
  if (err) return { kind: 'err', text: err };
  return null;
}
