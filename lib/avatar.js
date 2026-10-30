// Best-effort profile picture lookup, cached 7 days. Empty string = overlay draws initials.
//   YouTube: needs YOUTUBE_API_KEY (same Google Cloud key as Bean Brawl) + channel ID from Fossabot
//   Twitch:  TWITCH_CLIENT_ID + TWITCH_CLIENT_SECRET, else falls back to unavatar.io
//   Kick:    public channel endpoint (sometimes blocked by Cloudflare -> initials)
const { pipe } = require('./redis');

async function tfetch(url, opts = {}, ms = 2500) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: c.signal });
  } finally {
    clearTimeout(t);
  }
}

async function twitchToken() {
  const [cached] = await pipe([['GET', 'lcs:twitch_token']]);
  if (cached) return cached;
  const r = await tfetch(
    `https://id.twitch.tv/oauth2/token?client_id=${process.env.TWITCH_CLIENT_ID}&client_secret=${process.env.TWITCH_CLIENT_SECRET}&grant_type=client_credentials`,
    { method: 'POST' }
  );
  const j = await r.json();
  if (!j.access_token) return '';
  await pipe([['SET', 'lcs:twitch_token', j.access_token, 'EX', Math.max(60, (j.expires_in || 3600) - 120)]]);
  return j.access_token;
}

async function lookup({ platform, login, providerId }) {
  if (platform.includes('youtube')) {
    if (process.env.YOUTUBE_API_KEY && providerId) {
      const r = await tfetch(
        `https://www.googleapis.com/youtube/v3/channels?part=snippet&id=${encodeURIComponent(providerId)}&key=${process.env.YOUTUBE_API_KEY}`
      );
      const j = await r.json();
      const th = j.items?.[0]?.snippet?.thumbnails;
      return th?.medium?.url || th?.default?.url || '';
    }
    return '';
  }
  if (platform.includes('twitch')) {
    if (process.env.TWITCH_CLIENT_ID && process.env.TWITCH_CLIENT_SECRET) {
      const token = await twitchToken();
      if (token) {
        const r = await tfetch(`https://api.twitch.tv/helix/users?login=${encodeURIComponent(login)}`, {
          headers: { 'Client-Id': process.env.TWITCH_CLIENT_ID, Authorization: `Bearer ${token}` },
        });
        const j = await r.json();
        if (j.data?.[0]?.profile_image_url) return j.data[0].profile_image_url;
      }
    }
    return `https://unavatar.io/twitch/${encodeURIComponent(login)}?fallback=false`;
  }
  if (platform.includes('kick')) {
    const r = await tfetch(`https://kick.com/api/v2/channels/${encodeURIComponent(login)}`, {
      headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' },
    });
    if (!r.ok) return '';
    const j = await r.json();
    return j.user?.profile_pic || '';
  }
  return '';
}

async function resolveAvatar(id) {
  const key = `lcs:av:${id.platform || 'x'}:${id.login}`;
  try {
    const [cached] = await pipe([['GET', key]]);
    if (cached) return cached;
  } catch {}
  let url = '';
  try {
    url = await lookup(id);
  } catch (e) {
    console.error('avatar lookup failed', e.message);
  }
  if (url) {
    try { await pipe([['SET', key, url, 'EX', 604800]]); } catch {}
  }
  return url;
}

module.exports = { resolveAvatar };
