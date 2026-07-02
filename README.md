# Floating CRM Dialer (Twilio Voice SDK)

Backend (`server.js`) + frontend (`public/dialer.html`) for a click-to-call
overlay that pops into a real floating window over the CRM using the
Document Picture-in-Picture API.

## 1. Twilio setup

1. Log into the Twilio Console, note your **Account SID** (top of dashboard).
2. Buy a voice-capable number: **Phone Numbers > Buy a number**.
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
npm start
```

Deploy to Render/Railway/Fly (any of these work fine — this is a plain
Express app, no special build step). Once deployed you'll have a URL like
`https://your-app.onrender.com`.

## 3. Finish Twilio config

1. In Twilio Console: **Voice > TwiML Apps > Create new TwiML App**.
2. Set **Voice Request URL** to `https://your-app.onrender.com/voice`,
   method `HTTP POST`.
3. Copy the new TwiML App SID into `TWIML_APP_SID` in your `.env` /
   deployment's environment variables.
4. Restart the deployed app so it picks up the env var.

## 4. Use it

Open `https://your-app.onrender.com/dialer.html` — that's the whole UI.
It boots the Twilio Device automatically, and status will read "Ready"
when it's registered.

- **Embed in the CRM**: iframe it, or just link out. If iframed same-origin,
  the CRM page can trigger a call directly:
  `document.getElementById('dialerFrame').contentWindow.dialerCall('+15551234567')`
- **Multiple reps**: append `?identity=marc` or `?identity=maplelock` to the
  URL per person. Each identity gets its own token registration, so calls/
  logs are attributable to the right rep in Twilio's console.
- **Pop-out window**: the "Pop out floating window" button uses
  `documentPictureInPicture.requestWindow()`. This literally moves the
  dialer's DOM node into a new always-on-top browser window — it's not a
  new tab, and it shares the same JS context, so the active call, device
  registration, and event listeners keep working without interruption
  when it pops in or out.

## Gotchas to know about before demoing this

- **Chromium only.** Document Picture-in-Picture works in Chrome/Edge 116+.
  Safari and Firefox don't support it — the button will alert and no-op
  gracefully, but the pop-out feature itself just won't be available there.
- **User gesture required.** The PiP window can only be opened from a direct
  click handler (which is how it's wired here) — you can't trigger it
  programmatically after a delay or from a fetch callback.
- **HTTPS required in production.** Microphone access (WebRTC) and PiP both
  need a secure context. `localhost` is exempt for local testing, but your
  deployed URL must be HTTPS (Render/Railway/Fly give you this by default).
- **Trial account limitation.** On a Twilio trial, outbound calls only reach
  numbers you've manually verified in the console. You'll need to add
  funds/upgrade the account before dialing real prospects.
- **Mic permission prompt.** First call will trigger a browser mic
  permission prompt — make sure whoever demos this allows it, and note
  that if the dialer is iframed, the iframe needs `allow="microphone"`.
