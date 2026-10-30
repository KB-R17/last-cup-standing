# ☕ Last Cup Standing

Bump-battle stream game for the Caffeinated Army. Viewers `!join` with their name + profile picture
and drop into a neon coffee cup. **Everyone starts with the same shields (default 5).**
Cups bounce around the cup and off its rim — every cup-on-cup bump costs both cups a shield.
No shields left → the next bump spills you. Last cup standing wins.

## Rules
- **Equal shields** for everyone (`START_SHIELDS`, default 5) — shown as a ring of cyan pips around each cup.
- **Bump = -1 shield** for each cup involved.
- **Shield cooldown** (1.0s): right after losing a shield a cup blinks and can't lose another,
  so a rebound off the next cup doesn't double-hit.
- **Static arena:** no shrinking zone, no hazards. The outer rim is a safe bounce wall.
- **Pacing:** speed ramps up over the round (shown as `SPEED ×1.4` etc.). After 75s cups drift toward
  their nearest rival so a final 1v1 can't stall. Tested: ~35s with 6 players, ~60s with 18.
- **Tiebreak:** if the last cups spill each other on the same bump, the one that hit harder survives.
- Spill feed shows who spilled whom; the winner screen shows their spills, shields left and total wins.

## How a round plays
1. **Lobby** (60s) — chat types `!join`; avatars pop in and drift around (no damage yet).
2. **3-2-1 BUMP!** — cups launch and start colliding.
3. Winner screen with crown, then the next lobby opens automatically.

## Deploy (same flow as sip-api / cope-o-meter)
```bash
cd ~/last-cup-standing
git init && git add . && git commit -m "Last Cup Standing"
gh repo create KB-R17/last-cup-standing --public --source=. --push   # or create it on github.com and push
```
Import the repo in Vercel, then add **Settings → Environment Variables** and redeploy:

| Name | Value |
|---|---|
| `UPSTASH_REDIS_REST_URL` | any Upstash DB (reusing sip-api's is fine — game keys are prefixed `lcs:`) |
| `UPSTASH_REDIS_REST_TOKEN` | matching token |
| `ADMIN_KEY` | any long random string (the overlay uses it) |
| `START_SHIELDS` | optional, default 5 (overlay and chat replies both use it) |
| `YOUTUBE_API_KEY` | optional — your Google Cloud key from Bean Brawl, for YouTube profile pics |
| `TWITCH_CLIENT_ID` / `TWITCH_CLIENT_SECRET` | optional — Twitch pics (falls back to unavatar.io without them) |
| `MAX_PLAYERS` | optional, default 60 |

## Fossabot commands
| Command | Response |
|---|---|
| `!join` | `$(customapi https://YOUR-APP.vercel.app/api/cmd?action=join&user=$(user.login))` |
| `!cupwins` | `$(customapi https://YOUR-APP.vercel.app/api/cmd?action=wins)` |

## OBS
Browser source, 1920×1080:
```
https://YOUR-APP.vercel.app/?key=YOUR_ADMIN_KEY
```
Options: `&shields=5` (overrides START_SHIELDS) · `&hitcd=1.0` (shield cooldown seconds) · `&lobby=90` ·
`&cooldown=15` · `&min=3` · `&auto=0` (manual) · `&bg=1` (opaque) · `&sound=0`.
Tick **Control audio via OBS** to give the game sounds their own fader.

### Background art
`public/bg.jpg` is the Donut Verse channel art, drawn full-screen at 50% opacity with a dark edge vignette.
The cup floor thins to 70% so the donut mascot shows through.
- `&bg=1` puts a solid dark base behind the art (best for a dedicated game scene). Without it, the art blends
  with whatever sits under the source in OBS.
- `&artop=0.3` fainter · `&artblur=4` soft-focus · `&floor=0.85` hide more of the art inside the cup.
- `&art=none` turns it off, or swap art by replacing `public/bg.jpg` (bg.png / bg.webp also work) or by passing `&art=https://…`.

Without `key=` the page runs in **demo mode** with bots — open `public/index.html` in a browser to try it.

**Hotkeys** (OBS: right-click source → Interact): `O` open lobby · `S` start now · `R` reset ·
`B` add 5 test bots · `K` spill a random player · `M` mute.

## Avatars
- **Twitch** — Helix API (with client ID/secret) or unavatar.io fallback.
- **YouTube** — needs `YOUTUBE_API_KEY`; uses the channel ID Fossabot sends with each command.
- **Kick** — Kick's public channel endpoint; if it blocks the request, the player gets a neon initials badge.
Avatars are cached for 7 days per user.

## Endpoints
- `GET /api/cmd?action=join|wins&user=` — Fossabot text replies
- `GET /api/state` — phase, roster, shield count, top 5 winners (overlay polls every 1.5s)
- `GET /api/round?key=&action=open|start|end|reset` — overlay controls; `reset&wins=1` wipes the leaderboard
