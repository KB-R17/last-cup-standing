// Overlay-only controls (requires ?key=ADMIN_KEY).
//   ?action=open                 new lobby (new round number)
//   ?action=start                lock the lobby, return the final roster
//   ?action=end&winner=&name=    record the win
//   ?action=reset[&wins=1]       clear round state (wins=1 also wipes the leaderboard)
const { pipe, hashToObj, parse } = require('../lib/redis');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  const q = req.query || {};
  if (!process.env.ADMIN_KEY || q.key !== process.env.ADMIN_KEY) return res.status(401).json({ error: 'bad key' });

  try {
    const action = String(q.action || '').toLowerCase();
    const [stateRaw] = await pipe([['GET', 'lcs:state']]);
    let state = parse(stateRaw, { phase: 'idle', round: 0 });
    const save = (s) => ['SET', 'lcs:state', JSON.stringify(s), 'EX', 86400];

    if (action === 'open') {
      const [round] = await pipe([['INCR', 'lcs:round']]);
      state = { phase: 'open', round, openedAt: Date.now() };
      await pipe([save(state)]);
      return res.json({ state });
    }

    if (action === 'start') {
      if (!state.round) return res.status(400).json({ error: 'no round' });
      const rk = `lcs:roster:${state.round}`;
      const [raw] = await pipe([['HGETALL', rk]]);
      const roster = Object.values(hashToObj(raw)).map((v) => parse(v, null)).filter(Boolean);
      state = { ...state, phase: 'live', startedAt: Date.now() };
      await pipe([save(state)]);
      return res.json({ state, roster });
    }

    if (action === 'end') {
      const winner = String(q.winner || '').toLowerCase();
      state = { ...state, phase: 'cooldown', endedAt: Date.now() };
      const cmds = [save(state)];
      if (winner) {
        cmds.push(['ZINCRBY', 'lcs:wins', 1, winner]);
        cmds.push(['HSET', 'lcs:names', winner, String(q.name || winner).slice(0, 32)]);
        cmds.push(['SET', 'lcs:last', JSON.stringify({ login: winner, name: q.name || winner, at: Date.now() })]);
      }
      const out = await pipe(cmds);
      return res.json({ state, wins: winner ? parseInt(out[1], 10) : null });
    }

    if (action === 'reset') {
      const cmds = [['DEL', 'lcs:state']];
      if (state.round) cmds.push(['DEL', `lcs:roster:${state.round}`]);
      if (q.wins === '1') cmds.push(['DEL', 'lcs:wins', 'lcs:names', 'lcs:last']);
      await pipe(cmds);
      return res.json({ ok: true });
    }

    return res.status(400).json({ error: 'unknown action' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
};
