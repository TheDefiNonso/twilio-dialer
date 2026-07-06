# Floating CRM Dialer (Twilio Voice SDK) — Multi-Rep Edition

Backend (`server.js`) + frontend (`public/dialer.html`) for a click-to-call
overlay that pops into a real floating window over Airtable, with each rep
calling from their own Twilio number.

## Multi-rep setup: callers.json

Each rep is identified by a URL param (`?identity=marc`) and mapped to their
own Twilio number in `callers.json`:

```json
{
  "marc": { "label": "Marc", "number": "+15550000001" },
  "rep2": { "label": "Rep 2", "number": "+15550000002" }
}
```

To add/remove a rep or change a number, edit this file and redeploy — no
Twilio console changes needed beyond having bought that rep's number.

**You need one Twilio number per rep.** If you've only bought one so far,
go back to Twilio Console → Phone Numbers → Buy a number, and repeat for
each of the 4 callers.

**On "login":** there isn't a password-based login here — each rep's
identity comes from the URL they use (`?identity=marc`). For 4 known,
trusted internal people this is a normal shortcut and avoids building a
full auth system. The tradeoff: anyone with a rep's specific link could
place calls under their number, so don't post these links anywhere public
(a private Airtable Interface page is fine).

## 1. Twilio setup

1. Log into the Twilio Console, note your **Account SID** (top of dashboard).
2. Buy one voice-capable number **per rep** (4 total): **Phone Numbers > Buy a number**.
3. Create a Standard API Key: **Account > API keys & tokens > Create API key**
   (choose "Standard", not "Main"). Save the **SID** and **Secret** — the
   secret is shown once, it will not resurface.
4. You need a **TwiML App SID** but you can't create it until you have a
   deployed `/voice` URL, so do step 2 (deploy) first, then come back here.

## 2. Local setup / deploy

```bash
npm install
cp .env.example .env
# fill in .env — leave TWIML_APP_SID blank for now if you don't have it yet
# edit callers.json with your 4 reps' real numbers
npm start
```

Deploy to Render (or Railway/Fly). This is a plain Express app, no special
build step. `npm install` automatically copies the Twilio Voice SDK into
`public/twilio.min.js` via a postinstall hook — nothing to configure there.

## 3. Custom domain (dialer.maplelock.com)

Making this feel like part of Maplelock rather than a random Render URL is
just a DNS + Render settings step, not a rebuild:

1. In Render → your service → **Settings → Custom Domain → Add Custom Domain**,
   enter `dialer.maplelock.com`. Render will show you a CNAME target
   (something like `your-app.onrender.com`).
2. Whoever manages Maplelock's DNS (their domain registrar or DNS host —
   Cloudflare, GoDaddy, Namecheap, etc.) needs to add:
   ```
   Type:  CNAME
   Name:  dialer
   Value: your-app.onrender.com
   ```
3. DNS propagation is usually a few minutes, sometimes up to an hour.
   Render auto-issues an SSL certificate for the domain once it verifies —
   no manual cert work needed.
4. Once live, update your TwiML App's Voice Request URL to
   `https://dialer.maplelock.com/voice` (swap out the old Render URL),
   and update any Airtable button formulas to the new domain too.

You'll need someone with access to Maplelock's DNS settings to do step 2 —
that's the only piece that isn't fully in your control.

## 4. Finish Twilio config

1. In Twilio Console: **Voice > TwiML Apps > Create new TwiML App**.
2. Set **Voice Request URL** to `https://dialer.maplelock.com/voice`
   (or your Render URL if not on the custom domain yet), method `HTTP POST`.
3. Copy the new TwiML App SID into `TWIML_APP_SID` in your deployment's
   environment variables.
4. Restart the deployed app so it picks up the env var.

## 5. Per-rep Airtable setup

Since there's no login screen, each rep needs their own dedicated view —
this also solves the "even without logging in, they call from the right
number" requirement, because the identity is baked into the page they use,
not something they type in each time.

**Recommended: one Interface page per rep.**

1. In your Airtable Interface, create a separate page per rep (e.g.
   "Marc — Dial", "Rep 2 — Dial", etc.) — 4 pages total.
2. On each page, add an **Embed element** pointing to that rep's dialer:
   ```
   https://dialer.maplelock.com/dialer.html?identity=marc
   ```
   (swap `identity=marc` for the right identity on each page)
3. On the same page's record list, add a **Button element** (not a table
   Button field — a page-level button, so its formula can be
   page-specific) with an "Open URL" action:
   ```
   "https://dialer.maplelock.com/dialer.html?identity=marc&number=" & ENCODE_URL_COMPONENT({Phone})
   ```
   Add `&autodial=1` at the end if you want it to dial immediately instead
   of requiring a second click.
4. If your Airtable plan supports page-level permissions (Team/Business
   tier), restrict each page to that rep so they only see their own dial
   page. On lower tiers everyone can see all 4 pages — not a security
   issue for 4 trusted teammates, just less tidy.

This way: Marc bookmarks/uses his page, his embedded dialer is always
registered as `marc` calling from his number, and his button formula on
that page always passes `identity=marc` — so clicking a lead's phone
number from Marc's page always calls from Marc's number, automatically,
without anyone typing in a password.

## Gotchas to know about before demoing this

- **Chromium only.** Document Picture-in-Picture works in Chrome/Edge 116+.
  Safari and Firefox don't support it — the button will alert and no-op
  gracefully.
- **User gesture required.** The PiP window can only be opened from a direct
  click handler — you can't trigger it programmatically after a delay.
- **HTTPS required in production.** WebRTC and PiP both need a secure
  context. Render's custom domains get HTTPS automatically.
- **Trial account limitation.** On a Twilio trial, outbound calls only reach
  verified numbers. Add funds/upgrade before dialing real prospects.
- **Mic permission prompt.** First call triggers a browser mic permission
  prompt — if the dialer is iframed/embedded, the iframe needs
  `allow="microphone"` or the prompt may be blocked silently.
- **Unknown identity = hard error.** If someone opens the dialer with a
  typo'd or missing `?identity=`, it now shows a clear error instead of
  silently defaulting to a shared identity — this is intentional, so a
  misconfigured link fails loudly rather than routing calls under the
  wrong rep's number.

