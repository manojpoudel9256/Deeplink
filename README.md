# deeplink

A self-hosted app-opening link shortener. Turns a normal YouTube URL into a
short link that opens the YouTube **app** when tapped from inside Instagram's
or Facebook's in-app browser, instead of their trapped WebView.

Runs on Cloudflare Workers. Free tier covers 100,000 requests/day, which is
far more than a personal channel will use.

## How it actually works

The whole mechanism is two platform-specific tricks:

**Android** — the `intent://` scheme. This is a real, documented Android
feature that hands a URL to a named app package:

```
intent://www.youtube.com/watch?v=ID#Intent;scheme=https;
  package=com.google.android.youtube;S.browser_fallback_url=<encoded>;end
```

This is the reliable half. Android WebViews honour it, and if the app isn't
installed the fallback URL takes over.

**iOS** — a custom URL scheme, `youtube://watch?v=ID`. Less reliable: iOS
WebViews may drop the navigation silently, and Apple has tightened this over
successive releases. So the page also renders a button, because a
user-initiated tap succeeds in cases where automatic navigation doesn't.

Everything else — the short code, the KV lookup, the click counter — is
plumbing. Desktop visitors and real browsers get a plain 302; the
interstitial only renders when it has a job to do.

## Deploy

```bash
npm install -g wrangler
wrangler login

# 1. create the KV namespace, paste the printed id into wrangler.toml
wrangler kv namespace create LINKS

# 2. set your admin token (any long random string)
wrangler secret put ADMIN_TOKEN

# 3. ship
wrangler deploy
```

You get a `deeplink.<your-subdomain>.workers.dev` URL immediately — no domain
purchase needed to test. Add a custom domain later in the Cloudflare
dashboard under Workers → your worker → Settings → Domains.

## Local config

`wrangler.toml` is committed with a placeholder KV id so the repo stays
reusable. Your real ids belong in `wrangler.local.toml`, which is gitignored:

```bash
cp wrangler.toml wrangler.local.toml   # then paste your real KV id into it
npx wrangler deploy -c wrangler.local.toml
```

`ADMIN_TOKEN` is never in either file — it lives as a Worker secret in
production and in `.dev.vars` for local dev. Both are gitignored.

## Create a link

```bash
curl -X POST https://deeplink.<you>.workers.dev/api/links \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://youtu.be/dQw4w9WgXcQ"}'
```

```json
{ "code": "k4mQ2xv", "short": "https://deeplink.<you>.workers.dev/k4mQ2xv" }
```

Pass `"code":"myvideo"` to pick your own slug. Check clicks with
`GET /api/links/<code>` using the same bearer token.

## Testing it properly

Emulators and desktop browsers will lie to you. The only test that counts:

1. Post the short link in your own Instagram story (you can make it
   close-friends-only, or just delete it after).
2. Tap it on a real iPhone. Then on a real Android phone.
3. Confirm the YouTube app opens and you're logged in — the whole point is
   that the viewer can like, comment, and subscribe.
4. Test with the app *uninstalled* too, to confirm the browser fallback.

If iOS opens the browser instead, the automatic hand-off was blocked and the
button is doing its job. That's the expected degraded path, not a bug.

## What this deliberately doesn't do

- **No visitor tracking.** Counters are coarse: total clicks and an
  os/shell bucket. No IPs, no fingerprints, no per-visitor rows. Add more
  only if you actually need it.
- **No Instagram post/reel deep links on iOS.** Instagram's private scheme
  addresses media by numeric id, which isn't derivable from the URL
  shortcode. Universal links handle it; the Android intent still works.
- **No TikTok, Spotify, LINE, etc.** Adding one is a single block in
  `resolveTarget` — you need the app's URL scheme and its Android package
  name.

## Things that will bite you

**Scheme drift.** `youtube://` and friends are private schemes. Apple and
Google change WebView behaviour without notice. This is exactly why the
commercial services have intermittent failures — it isn't incompetence,
it's the nature of the technique. Expect to re-test after major OS releases.

**Domain reputation.** Meta blocks link-shortener domains that get abused.
On a workers.dev subdomain you share reputation with everyone else on that
platform. If you move to a custom domain and only ever shorten your own
links, you're in good shape. Never let anyone else create links on your
instance — that's what `ADMIN_TOKEN` is protecting.

**Redirect loops.** Don't shorten a link that points back at your own
shortener.

## Adding an app

```js
if (host === "open.spotify.com") {
  return {
    app: "Spotify",
    web: rawUrl,
    ios: `spotify:${seg.join(":")}`,
    android: intentUrl(rawUrl, "com.spotify.music"),
    thumb: null,
  };
}
```

Find the Android package name in the Play Store URL (`?id=com.spotify.music`).
iOS schemes usually have to be found by searching or by inspecting the app.
