// Fossabot chat commands — returns plain text that Fossabot posts to chat.
//   !join     $(customapi https://YOUR-APP.vercel.app/api/cmd?action=join&user=$(user.login))
//   !cupwins  $(customapi https://YOUR-APP.vercel.app/api/cmd?action=wins)
const { pipe, parse } = require('../lib/redis');
const { resolveAvatar } = require('../lib/avatar');
const { identity } = require('../lib/identity');

const MAX = parseInt(process.env.MAX_PLAYERS || '60', 10);
const SHIELDS = parseInt(process.env.START_SHIELDS || '5', 10);

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  const send = (t) => res.status(200).send(t);

  try {
    const action = String(req.query.action || 'join').toLowerCase();
    const id = identity(req);

    if (action === 'wins') {
      const [top] = await pipe([['ZREVRANGE', 'lcs:wins', 0, 4, 'WITHSCORES']]);
      if (!top || !top.length) return send('🏆 No Last Cup Standing champs yet — be the first! Type !join when the lobby opens ☕');
      const logins = top.filter((_, i) => i % 2 === 0);
      const [names] = await pipe([['HMGET', 'lcs:names', ...logins]]);
      const list = logins.map((l, i) => `${i + 1}. ${names?.[i] || l} (${top[i * 2 + 1]})`).join(' · ');
      return send(`🏆 Last Cup Standing champs: ${list}`);
    }

    if (!id.login) return send("☕ Couldn't read your username — try again!");

    if (action === 'join') {
      const [stateRaw] = await pipe([['GET', 'lcs:state']]);
      const state = parse(stateRaw, { phase: 'idle' });
      if (state.phase === 'live') return send(`⚔️ @${id.name} a round is already brewing — !join when the next lobby opens!`);
      if (state.phase !== 'open') return send(`☕ @${id.name} no lobby open right now — watch for the call to !join!`);

      const rk = `lcs:roster:${state.round}`;
      const [exists, size] = await pipe([['HEXISTS', rk, id.login], ['HLEN', rk]]);
      if (exists) return send(`☕ @${id.name} you're already in the cup — hang tight!`);
      if (size >= MAX) return send(`🚫 @${id.name} the cup is full (${MAX}) — catch the next round!`);

      const avatar = await resolveAvatar(id);
      const player = { login: id.login, name: id.name, platform: id.platform, avatar, joinedAt: Date.now() };
      const [added] = await pipe([['HSETNX', rk, id.login, JSON.stringify(player)], ['EXPIRE', rk, 7200]]);
      if (!added) return send(`☕ @${id.name} you're already in the cup — hang tight!`);
      return send(`☕ @${id.name} is IN with ${SHIELDS} 🛡 — every bump costs one. Last cup standing wins!`);
    }

    return send('☕ Unknown action.');
  } catch (e) {
    console.error(e);
    return send('☕ The espresso machine jammed — try again in a sec!');
  }
};
