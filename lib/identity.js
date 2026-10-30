// Who sent the command. `user` query param (=$(user.login)) wins so keys match the !sip API.
// Fossabot's custom API also sends x-fossabot-* headers; we use them for display name,
// platform and provider ID (needed for avatars).
function h(req, name) {
  const v = req.headers[name];
  return Array.isArray(v) ? v[0] : v || '';
}

function identity(req) {
  const q = req.query || {};
  const raw = String(q.user || h(req, 'x-fossabot-message-userlogin') || '').trim().replace(/^@/, '');
  const login = raw.toLowerCase();
  const name = String(q.name || h(req, 'x-fossabot-message-userdisplayname') || raw).slice(0, 32);
  const platform = String(q.platform || h(req, 'x-fossabot-message-userprovider') || h(req, 'x-fossabot-channelprovider') || '')
    .toLowerCase();
  const providerId = String(q.pid || h(req, 'x-fossabot-message-userproviderid') || '');
  return { login, name, platform, providerId };
}

module.exports = { identity };
