/**
 * Deep-link redirector.
 *
 * GET  /:code            -> resolve short code, escape the in-app browser
 * POST /api/links        -> create a short link   (Bearer ADMIN_TOKEN)
 * GET  /api/links/:code  -> click stats           (Bearer ADMIN_TOKEN)
 */

// ---------------------------------------------------------------- targets

/**
 * Android's intent:// scheme is the single most reliable way to hand a URL
 * from a WebView to a named app. browser_fallback_url is honoured by Chrome
 * and most WebViews if the package isn't installed.
 */
function intentUrl(httpsUrl, pkg) {
  const u = new URL(httpsUrl);
  const bare = u.host + u.pathname + (u.search || "");
  return (
    `intent://${bare}#Intent;scheme=https;package=${pkg};` +
    `S.browser_fallback_url=${encodeURIComponent(httpsUrl)};end`
  );
}

/**
 * Map a destination URL to per-platform app links.
 * Returns null when we have no app-specific handling -> plain 302.
 */
function resolveTarget(rawUrl) {
  let u;
  try {
    u = new URL(rawUrl);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;

  const host = u.hostname.toLowerCase().replace(/^(www|m|mobile)\./, "");
  const seg = u.pathname.split("/").filter(Boolean);

  // ---- YouTube -----------------------------------------------------------
  if (host === "youtu.be" || host === "youtube.com") {
    let videoId = null;
    if (host === "youtu.be") videoId = seg[0];
    else if (u.pathname === "/watch") videoId = u.searchParams.get("v");
    else if (seg[0] === "shorts" || seg[0] === "live" || seg[0] === "embed")
      videoId = seg[1];

    if (videoId && /^[\w-]{6,20}$/.test(videoId)) {
      const canonical = `https://www.youtube.com/watch?v=${videoId}`;
      const t = u.searchParams.get("t");
      return {
        app: "YouTube",
        web: canonical + (t ? `&t=${encodeURIComponent(t)}` : ""),
        ios: `youtube://watch?v=${videoId}${t ? `&t=${encodeURIComponent(t)}` : ""}`,
        android: intentUrl(canonical, "com.google.android.youtube"),
        thumb: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      };
    }

    // channel, handle, playlist
    return {
      app: "YouTube",
      web: rawUrl,
      ios: `youtube://${u.host}${u.pathname}${u.search}`,
      android: intentUrl(rawUrl, "com.google.android.youtube"),
      thumb: null,
    };
  }

  // ---- Instagram ---------------------------------------------------------
  if (host === "instagram.com") {
    if (seg.length === 1 && !["p", "reel", "reels", "tv"].includes(seg[0])) {
      return {
        app: "Instagram",
        web: rawUrl,
        ios: `instagram://user?username=${seg[0]}`,
        android: intentUrl(`https://instagram.com/_u/${seg[0]}`, "com.instagram.android"),
        thumb: null,
      };
    }
    // Posts and reels are addressed by numeric media id in the private
    // scheme, which we can't derive from the shortcode. Universal links
    // handle iOS; the intent still works on Android.
    return {
      app: "Instagram",
      web: rawUrl,
      ios: null,
      android: intentUrl(rawUrl, "com.instagram.android"),
      thumb: null,
    };
  }

  // ---- X / Twitter -------------------------------------------------------
  if (host === "twitter.com" || host === "x.com") {
    const statusIdx = seg.indexOf("status");
    if (statusIdx > -1 && /^\d+$/.test(seg[statusIdx + 1] || "")) {
      return {
        app: "X",
        web: rawUrl,
        ios: `twitter://status?id=${seg[statusIdx + 1]}`,
        android: intentUrl(rawUrl, "com.twitter.android"),
        thumb: null,
      };
    }
    if (seg.length === 1) {
      return {
        app: "X",
        web: rawUrl,
        ios: `twitter://user?screen_name=${seg[0]}`,
        android: intentUrl(rawUrl, "com.twitter.android"),
        thumb: null,
      };
    }
  }

  return null;
}

// ---------------------------------------------------------------- platform

function detectPlatform(ua = "") {
  const os = /iPhone|iPad|iPod/i.test(ua)
    ? "ios"
    : /Android/i.test(ua)
      ? "android"
      : "other";

  // In-app WebViews. These are the ones that trap the link.
  let shell = "browser";
  if (/Instagram/i.test(ua)) shell = "instagram";
  else if (/FBAN|FBAV|FB_IAB/i.test(ua)) shell = "facebook";
  else if (/Line\//i.test(ua)) shell = "line";
  else if (/Twitter/i.test(ua)) shell = "x";
  else if (/Snapchat/i.test(ua)) shell = "snapchat";

  return { os, shell, inApp: shell !== "browser" };
}

// ---------------------------------------------------------------- the page

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
}

/**
 * The interstitial. Its whole job is to disappear in under a second, so:
 * no webfonts, no framework, no external CSS. The destination's own
 * thumbnail is the only remote asset, and it's optional.
 */
function interstitial(target, plat) {
  const appLink = plat.os === "android" ? target.android : target.ios;
  const web = target.web;

  // Escaping to Safari from a locked-down iOS WebView. Undocumented and
  // version-dependent, so it's an explicit user choice, never automatic.
  const safariEscape =
    plat.os === "ios" && plat.inApp
      ? "x-safari-" + web
      : null;

  const cfg = JSON.stringify({ appLink, web, auto: !!appLink });

  const thumb = target.thumb
    ? `<img class="art" src="${escapeHtml(target.thumb)}" alt="" fetchpriority="high">`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex">
<title>Opening ${escapeHtml(target.app)}</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  html, body { height: 100%; margin: 0; }
  body {
    display: grid;
    place-items: center;
    padding: 24px;
    background: #0e1013;
    color: #eef1f5;
    font: 400 16px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
          "Helvetica Neue", Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  .veil {
    position: fixed; inset: -10%;
    background-size: cover; background-position: center;
    filter: blur(56px) saturate(1.4);
    opacity: .38;
    pointer-events: none;
  }
  main { position: relative; width: 100%; max-width: 340px; text-align: center; }
  .art {
    width: 100%; aspect-ratio: 16 / 9; object-fit: cover;
    border-radius: 10px; margin-bottom: 22px;
    background: #1b1f25;
  }
  h1 { margin: 0 0 6px; font-size: 19px; font-weight: 600; letter-spacing: -.01em; }
  p { margin: 0 0 22px; font-size: 14px; color: #97a0ad; }
  a.act {
    display: block; padding: 14px 18px; border-radius: 10px;
    text-decoration: none; font-size: 15px; font-weight: 600;
    background: #eef1f5; color: #0e1013;
  }
  a.act.quiet {
    margin-top: 10px; background: transparent; color: #97a0ad;
    font-weight: 400; border: 1px solid #2a3038;
  }
  a.act:focus-visible { outline: 2px solid #7aa2ff; outline-offset: 3px; }
  .spin {
    width: 18px; height: 18px; margin: 0 auto 18px;
    border: 2px solid #2a3038; border-top-color: #eef1f5;
    border-radius: 50%; animation: r .7s linear infinite;
  }
  @keyframes r { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { .spin { animation: none; } }
</style>
</head>
<body>
${target.thumb ? `<div class="veil" style="background-image:url('${escapeHtml(target.thumb)}')"></div>` : ""}
<main>
  ${thumb}
  <div class="spin" id="spin"></div>
  <h1 id="head">Opening ${escapeHtml(target.app)}</h1>
  <p id="sub">This takes a second.</p>
  <a class="act" id="go" href="${escapeHtml(appLink || web)}">Open ${escapeHtml(target.app)}</a>
  ${safariEscape ? `<a class="act quiet" href="${escapeHtml(safariEscape)}">Open in Safari instead</a>` : ""}
  <a class="act quiet" id="webfall" href="${escapeHtml(web)}">Continue in browser</a>
</main>
<script>
(function () {
  var c = ${cfg};
  var fired = false;

  function fallback() {
    if (fired) return;
    fired = true;
    if (document.visibilityState === 'hidden') return; // app took over
    document.getElementById('spin').style.display = 'none';
    document.getElementById('head').textContent = 'Tap to open';
    document.getElementById('sub').textContent =
      'Your browser blocked the automatic hand-off.';
  }

  // If the app opens, the page is backgrounded. Cancel the fallback.
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') fired = true;
  });

  if (c.auto) {
    // Same-tab navigation to a custom scheme. In a WebView this either
    // launches the app or is silently dropped -- hence the timer.
    try { window.location.replace(c.appLink); } catch (e) {}
    setTimeout(fallback, 1600);
  } else {
    window.location.replace(c.web);
  }
})();
</script>
</body>
</html>`;
}

// ---------------------------------------------------------------- storage

function newCode(len = 7) {
  const alphabet = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

function authorized(request, env) {
  const header = request.headers.get("Authorization") || "";
  const token = header.replace(/^Bearer\s+/i, "");
  return !!env.ADMIN_TOKEN && token === env.ADMIN_TOKEN;
}

/** Coarse counters only. No IPs, no per-visitor records. */
async function countClick(env, code, plat) {
  const key = `stats:${code}`;
  const cur = (await env.LINKS.get(key, "json")) || {};
  cur.total = (cur.total || 0) + 1;
  const bucket = `${plat.os}/${plat.shell}`;
  cur.by = cur.by || {};
  cur.by[bucket] = (cur.by[bucket] || 0) + 1;
  cur.last = new Date().toISOString();
  await env.LINKS.put(key, JSON.stringify(cur));
}

// ---------------------------------------------------------------- router

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === "/" || path === "/favicon.ico") {
      return new Response("ok", { status: 200 });
    }

    // ---- create ----------------------------------------------------------
    if (path === "/api/links" && request.method === "POST") {
      if (!authorized(request, env))
        return json({ error: "unauthorized" }, 401);

      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: "body must be JSON" }, 400);
      }
      if (!body.url) return json({ error: "url is required" }, 400);
      if (!resolveTargetSafe(body.url))
        return json({ error: "url must be a valid http(s) URL" }, 400);

      const code = body.code || newCode();
      if (!/^[\w-]{3,32}$/.test(code))
        return json({ error: "code must be 3-32 word characters" }, 400);
      if (await env.LINKS.get(`link:${code}`))
        return json({ error: "code already taken" }, 409);

      await env.LINKS.put(
        `link:${code}`,
        JSON.stringify({ url: body.url, created: new Date().toISOString() }),
      );

      return json({ code, short: `${url.origin}/${code}`, url: body.url }, 201);
    }

    // ---- stats -----------------------------------------------------------
    if (path.startsWith("/api/links/") && request.method === "GET") {
      if (!authorized(request, env))
        return json({ error: "unauthorized" }, 401);
      const code = path.slice("/api/links/".length);
      const link = await env.LINKS.get(`link:${code}`, "json");
      if (!link) return json({ error: "not found" }, 404);
      const stats = (await env.LINKS.get(`stats:${code}`, "json")) || { total: 0 };
      return json({ code, ...link, stats });
    }

    // ---- redirect --------------------------------------------------------
    const code = path.slice(1);
    if (!/^[\w-]{3,32}$/.test(code)) return new Response("Not found", { status: 404 });

    const link = await env.LINKS.get(`link:${code}`, "json");
    if (!link) return new Response("Not found", { status: 404 });

    const plat = detectPlatform(request.headers.get("User-Agent") || "");
    ctx.waitUntil(countClick(env, code, plat).catch(() => {}));

    const target = resolveTarget(link.url);

    // Desktop, or a real browser, or an unrecognised destination: the app
    // hand-off is pointless. Send a plain redirect, it's faster.
    if (!target || plat.os === "other" || !plat.inApp) {
      return Response.redirect(link.url, 302);
    }

    return new Response(interstitial(target, plat), {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
      },
    });
  },
};

function resolveTargetSafe(raw) {
  try {
    const u = new URL(raw);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
