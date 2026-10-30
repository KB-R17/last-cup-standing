// Tiny Upstash REST helper — uses the /pipeline endpoint (the format proven in sip-api).
async function pipe(cmds, base = process.env.UPSTASH_REDIS_REST_URL, token = process.env.UPSTASH_REDIS_REST_TOKEN) {
  if (!base || !token) throw new Error('Missing UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN');
  const r = await fetch(`${base}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmds),
  });
  if (!r.ok) throw new Error(`Upstash ${r.status}: ${await r.text()}`);
  const out = await r.json();
  return out.map((x) => {
    if (x.error) throw new Error(x.error);
    return x.result;
  });
}

// HGETALL returns [field, value, field, value...] over REST
function hashToObj(arr) {
  const o = {};
  if (!Array.isArray(arr)) return o;
  for (let i = 0; i < arr.length; i += 2) o[arr[i]] = arr[i + 1];
  return o;
}

function parse(json, fallback) {
  try { return json ? JSON.parse(json) : fallback; } catch { return fallback; }
}

module.exports = { pipe, hashToObj, parse };
