// Fossabot chat commands — returns plain text that Fossabot posts to chat.
//   !battle   $(customapi https://YOUR-APP.vercel.app/api/cmd?action=join&user=$(user.login))
//   !cupwins  $(customapi https://YOUR-APP.vercel.app/api/cmd?action=wins)
const { pipe, parse } = require('../lib/redis');
const { resolveAvatar } = require('../lib/avatar');
const { identity } = require('../lib/identity');

const MAX = parseInt(process.env.MAX_PLAYERS || '60', 10);
const SHIELDS = parseInt(process.env.START_SHIELDS || '5', 10);
const JOIN = '!' + String(process.env.JOIN_CMD || 'battle').replace(/^!/, '');   // the chat command viewers type to enter

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
      if (!top || !top.length) return send(`🏆 No Last Cup Standing champs yet — be the first! Type ${JOIN} when the lobby opens ☕`);
      const logins = top.filter((_, i) => i % 2 === 0);
      const [names] = await pipe([['HMGET', 'lcs:names', ...logins]]);
      const list = logins.map((l, i) => `${i + 1}. ${names?.[i] || l} (${top[i * 2 + 1]})`).join(' · ');
      return send(`🏆 Last Cup Standing champs: ${list}`);
    }

    // Host-only commands. The Fossabot response URL carries &key=ADMIN_KEY (never shown in chat);
    // also set these commands to Moderator/Broadcaster permission in Fossabot.
    if (['start', 'next', 'wipe'].includes(action)) {
      if (!process.env.ADMIN_KEY || req.query.key !== process.env.ADMIN_KEY) return send('🔒 Host only.');
      if (action === 'start') {
        const [stateRaw] = await pipe([['GET', 'lcs:state']]);
        const state = parse(stateRaw, { phase: 'idle' });
        if (state.phase === 'live') return send('⚔️ A round is already brewing!');
        if (state.phase !== 'open') return send('☕ No lobby open — use !cupnext to open one.');
        const [n] = await pipe([['HLEN', `lcs:roster:${state.round}`]]);
        if (n < 2) return send(`☕ Need at least 2 cups to start — ${n} joined so far. Type ${JOIN}!`);
        await pipe([['SET', 'lcs:req', 'start', 'EX', 30]]);
        return send(`🔔 ${n} cups in — 3… 2… 1… BUMP!`);
      }
      if (action === 'next') {
        await pipe([['SET', 'lcs:req', 'open', 'EX', 30]]);
        return send(`☕ New lobby is open — type ${JOIN} to enter the cup!`);
      }
      if (action === 'wipe') {
        await pipe([['DEL', 'lcs:wins', 'lcs:names', 'lcs:last']]);
        return send('🧹 Last Cup Standing Hall of Fame has been wiped. Fresh season!');
      }
    }

    if (action === 'whoami') {
      // Debug: shows what Fossabot sent and whether an avatar resolves. Safe to leave in.
      const avatar = id.login ? await resolveAvatar(id) : '';
      return send(
        `🔎 login=${id.login || '?'} platform=${id.platform || '?'} id=${id.providerId ? id.providerId.slice(0, 8) + '…' : 'none'} ` +
          `ytkey=${process.env.YOUTUBE_API_KEY ? 'set' : 'missing'} avatar=${avatar ? 'found' : 'none'}`
      );
    }

    if (!id.login) return send("☕ Couldn't read your username — try again!");

    if (action === 'join') {
      const [stateRaw] = await pipe([['GET', 'lcs:state']]);
      const state = parse(stateRaw, { phase: 'idle' });
      if (state.phase === 'live') return send(`⚔️ @${id.name} a round is already brewing — ${JOIN} when the next lobby opens!`);
      if (state.phase !== 'open') return send(`☕ @${id.name} no lobby open right now — watch for the call to ${JOIN}!`);

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
