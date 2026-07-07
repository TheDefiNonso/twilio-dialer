require('dotenv').config();
const express = require('express');
const path = require('path');
const twilio = require('twilio');

const { jwt: { AccessToken } } = twilio;
const { VoiceGrant } = AccessToken;
const VoiceResponse = twilio.twiml.VoiceResponse;

const {
  ACCOUNT_SID,
  API_KEY_SID,
  API_KEY_SECRET,
  TWIML_APP_SID,
  PORT = 3000,
} = process.env;

// Fail loudly at boot if config is missing — better than a cryptic 500 later
const required = { ACCOUNT_SID, API_KEY_SID, API_KEY_SECRET, TWIML_APP_SID };
const missing = Object.entries(required).filter(([, v]) => !v).map(([k]) => k);
if (missing.length) {
  console.error(`Missing required env vars: ${missing.join(', ')}`);
  console.error('Copy .env.example to .env and fill it in.');
  process.exit(1);
}

// Per-rep caller number lookup. Each identity gets its own outbound
// Caller ID. Edit callers.json to add/remove reps or swap in real numbers —
// no code changes needed, just a redeploy.
let callers;
try {
  callers = require('./callers.json');
} catch (e) {
  console.error('Could not load callers.json — see callers.json.example for format.');
  process.exit(1);
}

const validIdentities = new Set(Object.keys(callers));

/**
 * Cleans up messy phone numbers into strict E.164 (+1XXXXXXXXXX) format.
 * Handles cases like "905-764-9166 ext:52" by cutting everything from
 * "ext" onward, stripping all punctuation, and capping to exactly 10
 * digits after an optional leading US country code.
 * Returns null if it can't confidently produce a valid 10-digit number.
 */
function normalizePhoneNumber(raw) {
  if (!raw) return null;

  // Cut off anything from "ext"/"ext."/"ext:" onward, case-insensitive
  // (e.g. "905-764-9166 ext:52" -> "905-764-9166 ")
  const withoutExtension = raw.split(/ext\.?:?\s*\d*/i)[0];

  // Strip everything except digits
  let digits = withoutExtension.replace(/\D/g, '');

  // Drop a leading US country code if present (11 digits starting with 1)
  if (digits.length === 11 && digits.startsWith('1')) {
    digits = digits.slice(1);
  }

  // Cap at exactly 10 digits — anything beyond this (stray extension
  // digits, typos) is dropped rather than dialed
  digits = digits.slice(0, 10);

  if (digits.length !== 10) return null; // not enough to confidently dial

  return `+1${digits}`;
}

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false })); // Twilio posts form-urlencoded to /voice
app.use(express.static(path.join(__dirname, 'public')));

/**
 * GET /token?identity=agent
 * Mints a short-lived Voice access token for the browser SDK.
 * If you have multiple reps sharing this dialer, pass a distinct
 * identity per rep (e.g. their name/email slug) so incoming calls
 * and call logs can be told apart in Twilio.
 */
app.get('/token', (req, res) => {
  const identity = (req.query.identity || '').replace(/[^a-zA-Z0-9_.-]/g, '');

  if (!validIdentities.has(identity)) {
    return res.status(400).json({
      error: `Unknown identity "${identity}". Check callers.json for valid identities.`,
    });
  }

  const voiceGrant = new VoiceGrant({
    outgoingApplicationSid: TWIML_APP_SID,
    incomingAllow: true, // lets this identity also receive browser calls, if you wire that up later
  });

  const token = new AccessToken(ACCOUNT_SID, API_KEY_SID, API_KEY_SECRET, {
    identity,
    ttl: 3600, // 1 hour — front end should re-fetch before this expires on long shifts
  });
  token.addGrant(voiceGrant);

  res.json({
    token: token.toJwt(),
    identity,
    label: callers[identity].label,
    callerNumber: callers[identity].number,
  });
});

/**
 * POST /voice
 * This is the TwiML App's Voice Request URL. Twilio calls this
 * when the browser SDK places an outbound call, and expects TwiML back.
 */
app.post('/voice', (req, res) => {
  const twiml = new VoiceResponse();
  const to = (req.body.To || '').trim();

  // When the browser SDK places a call, Twilio's request here includes
  // From = "client:<identity>" — that's how we know which rep is calling
  // and therefore which of their numbers to show as the Caller ID.
  const rawFrom = req.body.From || '';
  const callingIdentity = rawFrom.replace(/^client:/, '');
  const callerRecord = callers[callingIdentity];

  if (!callerRecord) {
    console.error(`Unknown calling identity: "${callingIdentity}"`);
    twiml.say('Your caller identity was not recognized. Contact your admin.');
    return res.type('text/xml').send(twiml.toString());
  }

  if (!to) {
    twiml.say('No destination number was provided.');
    return res.type('text/xml').send(twiml.toString());
  }

  const dial = twiml.dial({ callerId: callerRecord.number });

  // Treat anything with typical phone punctuation OR an "ext" marker as a
  // phone number to normalize. Otherwise, treat it as a client identity
  // (browser-to-browser call).
  const looksLikePhoneNumber = /ext/i.test(to) || /^[\d+\-().\s]+$/.test(to);

  if (looksLikePhoneNumber) {
    const normalized = normalizePhoneNumber(to);
    if (!normalized) {
      console.error(`Could not normalize number: "${to}"`);
      twiml.say('The destination number could not be understood. Please check it and try again.');
      return res.type('text/xml').send(twiml.toString());
    }
    dial.number(normalized);
  } else {
    dial.client(to);
  }

  res.type('text/xml').send(twiml.toString());
});

app.get('/health', (req, res) => res.json({ ok: true }));

// Bare root URL redirects to the actual dialer page, preserving any query string
app.get('/', (req, res) => {
  const qs = req.url.split('?')[1];
  res.redirect(qs ? `/dialer.html?${qs}` : '/dialer.html');
});

app.listen(PORT, () => {
  console.log(`Dialer backend listening on port ${PORT}`);
});
