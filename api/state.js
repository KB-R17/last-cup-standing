// Overlay polls this: current phase, roster of joined players, top winners, pending host command.
const { pipe, hashToObj, parse } = require('../lib/redis');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  try {
    // Only the overlay (which sends the admin key) consumes pending host commands.
    const isOverlay = process.env.ADMIN_KEY && (req.query || {}).key === process.env.ADMIN_KEY;
    const [stateRaw, top, reqCmd] = await pipe([
      ['GET', 'lcs:state'],
      ['ZREVRANGE', 'lcs:wins', 0, 4, 'WITHSCORES'],
      isOverlay ? ['GETDEL', 'lcs:req'] : ['GET', 'lcs:noop'],
    ]);
    const state = parse(stateRaw, { phase: 'idle', round: 0 });
    const logins = (top || []).filter((_, i) => i % 2 === 0);
    const cmds = [];
    if (state.round) cmds.push(['HGETALL', `lcs:roster:${state.round}`]);
    if (logins.length) cmds.push(['HMGET', 'lcs:names', ...logins]);
    const out = cmds.length ? await pipe(cmds) : [];
    const rosterRaw = state.round ? out.shift() : [];
    const names = logins.length ? out.shift() : [];
    const roster = Object.values(hashToObj(rosterRaw)).map((v) => parse(v, null)).filter(Boolean);
    res.status(200).json({
      state,
      roster,
      req: isOverlay ? reqCmd || null : null,
      shields: parseInt(process.env.START_SHIELDS || '5', 10),
      joinCmd: String(process.env.JOIN_CMD || 'battle').replace(/^!/, ''),
      top: logins.map((l, i) => ({ login: l, name: names?.[i] || l, wins: parseInt(top[i * 2 + 1], 10) })),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
};
