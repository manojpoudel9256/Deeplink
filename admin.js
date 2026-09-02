/**
 * The generator UI, served at /admin.
 *
 * Deliberately a static string: the page never contains a token, a link, or
 * anything account-specific. The admin token is typed by the operator and
 * kept in localStorage on their own device, then sent as a bearer header on
 * each API call. Nothing secret is compiled into this file, which is what
 * makes the repo safe to publish.
 */
export const ADMIN_HTML = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex,nofollow">
<title>Deeplink generator</title>
<style>
  :root {
    color-scheme: dark;
    --bg: #0e1013;
    --card: #161a20;
    --line: #262c35;
    --ink: #eef1f5;
    --dim: #97a0ad;
    --accent: #7aa2ff;
    --bad: #ff7a7a;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; }
  body {
    min-height: 100vh;
    padding: 32px 20px 64px;
    background: var(--bg);
    color: var(--ink);
    font: 400 16px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
          "Helvetica Neue", Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  .wrap { width: 100%; max-width: 620px; margin: 0 auto; }
  header { margin-bottom: 28px; }
  h1 { margin: 0 0 6px; font-size: 22px; font-weight: 600; letter-spacing: -.02em; }
  .lede { margin: 0; color: var(--dim); font-size: 14px; }
  section {
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: 12px;
    padding: 20px;
    margin-bottom: 16px;
  }
  h2 {
    margin: 0 0 14px; font-size: 12px; font-weight: 600;
    text-transform: uppercase; letter-spacing: .08em; color: var(--dim);
  }
  label { display: block; margin-bottom: 6px; font-size: 13px; color: var(--dim); }
  input[type=url], input[type=text], input[type=password] {
    width: 100%; padding: 12px 14px;
    background: #0f1216; color: var(--ink);
    border: 1px solid var(--line); border-radius: 9px;
    font: inherit; font-size: 15px;
  }
  input:focus { outline: 2px solid var(--accent); outline-offset: 1px; border-color: transparent; }
  input::placeholder { color: #5b6472; }
  .field + .field { margin-top: 14px; }
  .hint { margin: 6px 0 0; font-size: 12px; color: #6f7887; }
  button {
    font: inherit; font-weight: 600; cursor: pointer;
    border-radius: 9px; border: 1px solid transparent;
    transition: opacity .15s;
  }
  button:disabled { opacity: .5; cursor: default; }
  .primary {
    width: 100%; margin-top: 18px; padding: 14px 18px;
    background: var(--ink); color: var(--bg); font-size: 15px;
  }
  .primary:not(:disabled):hover { opacity: .88; }
  .ghost {
    padding: 7px 12px; font-size: 13px; font-weight: 500;
    background: transparent; color: var(--dim); border-color: var(--line);
  }
  .ghost:hover { color: var(--ink); border-color: #39414d; }
  .row { display: flex; gap: 8px; align-items: center; }
  .msg { margin-top: 14px; font-size: 14px; display: none; }
  .msg.bad { display: block; color: var(--bad); }
  #result { display: none; }
  #result.on { display: block; }
  .short {
    display: block; padding: 14px; margin-bottom: 12px;
    background: #0f1216; border: 1px solid var(--line); border-radius: 9px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 14px; color: var(--accent); word-break: break-all;
    text-decoration: none;
  }
  .steps { margin: 14px 0 0; padding-left: 18px; font-size: 13px; color: var(--dim); }
  .steps li { margin-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  th {
    text-align: left; padding: 0 8px 8px 0; font-size: 11px; font-weight: 600;
    text-transform: uppercase; letter-spacing: .06em; color: #6f7887;
  }
  td { padding: 10px 8px 10px 0; border-top: 1px solid var(--line); vertical-align: middle; }
  td.code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
  td.code a { color: var(--accent); text-decoration: none; }
  td.dest { color: var(--dim); font-size: 12px; max-width: 190px; overflow: hidden;
            text-overflow: ellipsis; white-space: nowrap; }
  td.hits { text-align: right; font-variant-numeric: tabular-nums; }
  td.act { text-align: right; width: 1%; white-space: nowrap; }
  .empty { color: #6f7887; font-size: 14px; margin: 0; }
  .scroll { overflow-x: auto; }
  @media (max-width: 480px) {
    body { padding: 20px 14px 48px; }
    td.dest, th.dest { display: none; }
  }
</style>
</head>
<body>
<div class="wrap">

  <header>
    <h1>Deeplink generator</h1>
    <p class="lede">Paste a YouTube link, get a short link that opens the app
      from inside Instagram and Facebook.</p>
  </header>

  <section>
    <h2>Admin token</h2>
    <div class="field">
      <div class="row">
        <input type="password" id="token" placeholder="Your ADMIN_TOKEN" autocomplete="off" spellcheck="false">
        <button class="ghost" id="forget" type="button">Forget</button>
      </div>
      <p class="hint">Stored only in this browser. Sent to nothing except your own worker.</p>
    </div>
  </section>

  <section>
    <h2>New link</h2>
    <form id="form">
      <div class="field">
        <label for="url">Video link</label>
        <input type="url" id="url" placeholder="https://youtu.be/xxxxxxxxxxx" required autocomplete="off" spellcheck="false">
      </div>
      <div class="field">
        <label for="slug">Custom name <span style="color:#5b6472">(optional)</span></label>
        <input type="text" id="slug" placeholder="leave empty for a random one" autocomplete="off" spellcheck="false">
        <p class="hint">3-32 characters: letters, numbers, hyphen, underscore.</p>
      </div>
      <button class="primary" id="go" type="submit">Generate deeplink</button>
      <p class="msg" id="err"></p>
    </form>
  </section>

  <section id="result">
    <h2>Your deeplink</h2>
    <a class="short" id="shortUrl" href="#" target="_blank" rel="noopener"></a>
    <div class="row">
      <button class="ghost" id="copy" type="button">Copy link</button>
      <button class="ghost" id="open" type="button">Open to test</button>
    </div>
    <ol class="steps">
      <li>Copy the link above.</li>
      <li>Add it to your Instagram or Facebook story with the link sticker.</li>
      <li>Tapping it opens the YouTube app, already signed in.</li>
    </ol>
  </section>

  <section>
    <h2>Your links</h2>
    <div class="scroll"><div id="list"><p class="empty">Enter your token to load.</p></div></div>
  </section>

</div>

<script>
(function () {
  var KEY = 'deeplink.token';
  var $ = function (id) { return document.getElementById(id); };
  var tokenBox = $('token');
  var lastShort = '';

  function store(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function load(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
  function drop(k) { try { localStorage.removeItem(k); } catch (e) {} }

  tokenBox.value = load(KEY);
  tokenBox.addEventListener('change', function () {
    store(KEY, tokenBox.value.trim());
    refresh();
  });
  $('forget').addEventListener('click', function () {
    drop(KEY);
    tokenBox.value = '';
    $('list').innerHTML = '<p class="empty">Enter your token to load.</p>';
  });

  function fail(text) {
    var box = $('err');
    box.textContent = text;
    box.className = 'msg bad';
  }
  function clearFail() { $('err').className = 'msg'; }

  function headers() {
    return {
      'Authorization': 'Bearer ' + tokenBox.value.trim(),
      'Content-Type': 'application/json'
    };
  }

  function explain(status, data) {
    if (status === 401) return 'Token rejected. Check your ADMIN_TOKEN.';
    if (status === 409) return 'That custom name is taken. Try another.';
    if (data && data.error) return data.error;
    return 'Something went wrong (HTTP ' + status + ').';
  }

  $('form').addEventListener('submit', function (e) {
    e.preventDefault();
    clearFail();

    var token = tokenBox.value.trim();
    if (!token) { fail('Enter your admin token first.'); return; }

    var payload = { url: $('url').value.trim() };
    var slug = $('slug').value.trim();
    if (slug) payload.code = slug;

    var btn = $('go');
    btn.disabled = true;
    btn.textContent = 'Generating...';

    fetch('/api/links', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(payload)
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        return { status: r.status, data: d };
      });
    }).then(function (res) {
      if (res.status !== 201) { fail(explain(res.status, res.data)); return; }
      lastShort = res.data.short;
      var a = $('shortUrl');
      a.textContent = lastShort;
      a.href = lastShort;
      $('result').className = 'on';
      $('slug').value = '';
      $('url').value = '';
      $('copy').textContent = 'Copy link';
      refresh();
      $('result').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }).catch(function () {
      fail('Network error. Are you online?');
    }).then(function () {
      btn.disabled = false;
      btn.textContent = 'Generate deeplink';
    });
  });

  function copyText(text, button) {
    function done() {
      var old = button.textContent;
      button.textContent = 'Copied';
      setTimeout(function () { button.textContent = old; }, 1400);
    }
    function legacy() {
      var t = document.createElement('textarea');
      t.value = text;
      t.style.position = 'fixed';
      t.style.opacity = '0';
      document.body.appendChild(t);
      t.select();
      try { document.execCommand('copy'); done(); } catch (e) {}
      document.body.removeChild(t);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, legacy);
    } else {
      legacy();
    }
  }

  $('copy').addEventListener('click', function () { copyText(lastShort, this); });
  $('open').addEventListener('click', function () {
    if (lastShort) window.open(lastShort, '_blank', 'noopener');
  });

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function refresh() {
    if (!tokenBox.value.trim()) return;
    fetch('/api/links', { headers: headers() })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        var box = $('list');
        if (!d) { box.innerHTML = '<p class="empty">Could not load. Check your token.</p>'; return; }
        if (!d.links || !d.links.length) {
          box.innerHTML = '<p class="empty">No links yet.</p>';
          return;
        }
        var rows = d.links.map(function (l) {
          return '<tr>' +
            '<td class="code"><a href="/' + esc(l.code) + '" target="_blank" rel="noopener">/' + esc(l.code) + '</a></td>' +
            '<td class="dest">' + esc(l.url) + '</td>' +
            '<td class="hits">' + (l.clicks || 0) + '</td>' +
            '<td class="act"><button class="ghost" data-copy="' + esc(l.code) + '" type="button">Copy</button></td>' +
            '</tr>';
        }).join('');
        box.innerHTML = '<table><thead><tr>' +
          '<th>Link</th><th class="dest">Destination</th>' +
          '<th style="text-align:right">Clicks</th><th></th>' +
          '</tr></thead><tbody>' + rows + '</tbody></table>';

        var buttons = box.querySelectorAll('button[data-copy]');
        for (var i = 0; i < buttons.length; i++) {
          buttons[i].addEventListener('click', function () {
            copyText(location.origin + '/' + this.getAttribute('data-copy'), this);
          });
        }
      })
      .catch(function () {});
  }

  refresh();
})();
</script>
</body>
</html>`;
