import { onRequest } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';

const PLAY_STORE_BASE = 'https://play.google.com/store/apps/details?id=com.rhemaglobalministries.app';
const APP_STORE_FALLBACK = 'https://apps.apple.com/search?term=Rhema%20Global%20Ministries';

const escapeHtml = (unsafe: string): string =>
  String(unsafe || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const normalizeLast10 = (raw: string): string => {
  const digits = String(raw || '').replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : '';
};

/**
 * Serves the smart web landing & deep-link bridge page for `/invite`.
 * Strictly read-only: opening this link multiple times never creates duplicate records.
 */
export const guestInviteLanding = onRequest({ cors: true }, async (req, res) => {
  const churchId = String(req.query.c || req.query.churchId || 'rhema').trim() || 'rhema';
  const inviteId = normalizeLast10(String(req.query.i || req.query.inviteId || req.query.phone || ''));
  const eventId = String(req.query.e || req.query.eventId || '').trim();

  let churchName = 'Rhema Global Ministries';
  let guestName = '';
  let invitedBy = '';

  try {
    const db = getFirestore();
    const churchRef = db.collection('Rhema Church').doc(churchId);
    const [churchSnap, inviteSnap] = await Promise.all([
      churchRef.get(),
      inviteId ? churchRef.collection('guestInvites').doc(inviteId).get() : Promise.resolve(null),
    ]);

    if (churchSnap.exists) {
      churchName = churchSnap.data()?.name || churchName;
    }

    if (inviteSnap && inviteSnap.exists) {
      const data = inviteSnap.data() || {};
      guestName = data.guestName || '';
      invitedBy = data.invitedByMemberName || '';
    } else if (inviteId) {
      const detMember = await churchRef.collection('members').doc(`guest_${inviteId}`).get();
      if (detMember.exists) {
        const data = detMember.data() || {};
        guestName = data.name || data.displayName || '';
        invitedBy = data.invitedByMemberName || '';
      }
    }
  } catch (err) {
    console.warn('[guestInviteLanding] Lookup warning:', err);
  }

  const deepQueryParts = [`c=${encodeURIComponent(churchId)}`];
  if (inviteId) deepQueryParts.push(`i=${encodeURIComponent(inviteId)}`);
  if (eventId) deepQueryParts.push(`e=${encodeURIComponent(eventId)}`);

  const deepLink = `rhema://invite?${deepQueryParts.join('&')}`;
  const playStoreReferrer = encodeURIComponent(deepQueryParts.join('&'));
  const playStoreUrl = `${PLAY_STORE_BASE}&referrer=${playStoreReferrer}`;

  const safeChurchName = escapeHtml(churchName);
  const safeGuestName = escapeHtml(guestName || 'Friend');
  const safeInvitedBy = escapeHtml(invitedBy);
  const safeMaskedPhone = inviteId ? escapeHtml(`••••• •${inviteId.slice(-4)}`) : '';

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Invitation • ${safeChurchName}</title>
  <style>
    * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    body { margin: 0; min-height: 100vh; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; padding: 20px; }
    .card { width: 100%; max-width: 420px; background: #1e293b; border: 1px solid rgba(255,255,255,0.12); border-radius: 24px; padding: 28px 24px; box-shadow: 0 20px 50px rgba(0,0,0,0.45); text-align: center; }
    .badge { display: inline-block; padding: 6px 14px; border-radius: 999px; background: rgba(16,185,129,0.16); color: #34d399; font-size: 12px; font-weight: 700; letter-spacing: 0.6px; text-transform: uppercase; margin-bottom: 14px; }
    h1 { margin: 0 0 8px; font-size: 24px; line-height: 1.25; color: #fff; }
    .subtitle { margin: 0 0 18px; color: #cbd5e1; font-size: 15px; line-height: 1.5; }
    .infoBox { background: rgba(15,23,42,0.55); border: 1px solid rgba(255,255,255,0.08); border-radius: 14px; padding: 14px 16px; margin-bottom: 20px; font-size: 13px; color: #94a3b8; line-height: 1.5; }
    .infoBox strong { color: #f8fafc; }
    .btn { display: block; width: 100%; text-decoration: none; padding: 15px 18px; border-radius: 14px; font-weight: 700; font-size: 16px; margin-bottom: 12px; transition: opacity 0.2s; }
    .btn-primary { background: #10b981; color: #052e16; }
    .btn-secondary { background: #334155; color: #f8fafc; border: 1px solid rgba(255,255,255,0.12); font-size: 14px; }
    .btn-ios { background: #0f172a; color: #f8fafc; border: 1px solid rgba(255,255,255,0.2); font-size: 14px; margin-bottom: 0; }
    .hint { margin-top: 16px; font-size: 12px; color: #64748b; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">Personal Guest Invitation</div>
    <h1>Welcome, ${safeGuestName}</h1>
    <p class="subtitle">
      ${safeInvitedBy ? `<strong>${safeInvitedBy}</strong> invited you to connect with ` : 'You are invited to connect with '}<strong>${safeChurchName}</strong>.
    </p>
    <div class="infoBox">
      No registration form is needed. Open the app and verify with OTP${safeMaskedPhone ? ` using mobile <strong>${safeMaskedPhone}</strong>` : ''}.
    </div>
    <a class="btn btn-primary" href="${escapeHtml(deepLink)}">Open in Rhema App</a>
    <a class="btn btn-secondary" href="${escapeHtml(playStoreUrl)}">Download on Google Play (Android)</a>
    <a class="btn btn-ios" href="${escapeHtml(APP_STORE_FALLBACK)}">Download on App Store (iOS)</a>
    <p class="hint">
      Already installed? Tap <strong>Open in Rhema App</strong> above to launch directly to your sign-in screen.
    </p>
  </div>
  <script>
    (function() {
      var deepLink = ${JSON.stringify(deepLink)};
      var ua = navigator.userAgent || '';
      if (/Android|iPhone|iPad|iPod/i.test(ua)) {
        setTimeout(function() {
          window.location.href = deepLink;
        }, 350);
      }
    })();
  </script>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).send(html);
});

