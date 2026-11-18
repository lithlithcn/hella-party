# Hella Party — guide for Claude

Multiplayer recognition party game (Pop Sauce–like) for friends. TypeScript everywhere.
Server = Cloudflare Worker + one Durable Object per room (authoritative). Client = Vite + Preact.
Owner speaks French: UI text in French, code/docs in English. No AI-generated assets (only code; CSS visuals, WebAudio sounds).

## Map
```
shared/protocol.ts      wire format (ClientMsg / ServerMsg / PublicState) — single source of truth
shared/answer.ts        normalize + judge(guess) → 'exact' | 'partial' | 'approx' | null
server/index.ts         routes: /api/new, /ws/CODE, /log/CODE → Room DO; else static assets
server/room.ts          Durable Object: sockets ↔ Game, per-viewer state broadcast (coalesced)
server/engine.ts        Game core: players, phases, questions, answers, score pipeline, settings
server/feature.ts       ServerFeature contract (events, score steps, actions, view, settings)
server/packs.ts         Question type + pack loading
client/feature.ts       ClientFeature contract (UI slots) — auto-registered via import.meta.glob
client/store.ts         socket + latest snapshot; useStore(), onFx(), act()
client/ui/*             core screens: stage (question/reveal/podium/answer box), lobby, players, chat
client/question-types/  <type>.tsx renders a question type (image, audio, video, text, script); common.ts = effects/clip helpers
client/studio/          Studio (/studio): local editor (IndexedDB) for packs + game sounds, exports .hellapack.zip
client/sfx.ts           game sounds (client/public/sfx/<id>.mp3), per-device overrides from the Studio, music loops
shared/pack.ts          pack.json format (PackFile / PackQuestion / MediaOpts) — Studio writes it, server reads it
features/<id>/          server.ts and/or client.tsx — ALL game rules beyond the core live here
content/packs/<id>/     pack.json + media/  (media copied to client/public/packs at build)
scripts/gen.mjs         auto-registers features/*/server.ts and content/packs/* → server/_gen (gitignored)
scripts/sim.mjs         end-to-end smoke test (needs a running server)
```

## Core flow (engine.ts)
`lobby → start() → [beforeQuestion → queued phases…] → question → questionEnd → reveal → repeat → endGame → podium → lobby`
- Phase = `{name, startedAt, endsAt, data}`; clients render countdowns from it (clock offset from `state.now`).
- `g.enqueue({name, ms, data, onEnd})` inside `on.beforeQuestion` inserts interludes (bets prep, minigame, série intro).
- `g.forced.push(question)` makes the next questions specific ones (série mode). `g.history` = questions played.
- Answer: judged server-side, best grade per question kept; points = score pipeline; upgrading partial→exact credits only the difference.
- Question ends early when every connected player has an exact answer.

## Adding a feature (the normal way to add anything)
1. `features/<id>/server.ts` → `export default defineFeature({ id, settings?, active?, init?, on?, score?, actions?, view? })`
   - state slice: `g.f[id]` (init re-runs at every game start). Keep it plain data.
   - settings keys are auto-prefixed: read with `g.setting('<id>.<key>')`; add `{key:'enabled', type:'bool'}` + `active: g => g.setting('<id>.enabled')` for toggles.
   - score step: `{ order, apply(g, ctx) }` — order 0 = scoring (base × speed). Use 10–90 for multipliers/bonuses (see §10 of docs/concept.md for intended order).
   - actions: client sends `act('<id>', 'name', payload)` → `actions.name(g, playerId, payload)`. Validate everything.
   - view: `(g, viewerId) => publicSlice` → `state.f[id]`. Hide secrets per viewer (e.g. others' bets).
   - timers: `g.later(ms, fn)` (auto-cleared on phase change). Messages: `g.fx(to|null, kind, data, id)`, `g.chat(text)`.
2. `features/<id>/client.tsx` → `export default { id, PlayerCard?, Stage?, Phases?, Hud?, Lobby?, onFx?, onKey? } satisfies ClientFeature`
3. Add a French label for the settings group in `client/ui/lobby.tsx` GROUPS (optional).
4. `npm run check` then `npm run dev` + `npm run sim`.
Errors inside feature code are caught (`g.guard`), logged in `/log/CODE`, and shown in chat with `?debug`.

## Adding content
- The owner makes packs in the Studio and sends `*.hellapack.zip` (or `hella-sounds.zip`). Add them with
  `node scripts/add-pack.mjs file.zip` → `content/packs/<id>/` (pack.json + media/) and/or `client/public/sfx/<event>.mp3`. Then commit + push.
  Check the printed summary (missing files, size). Big media (> ~5 MB) → ask before committing.
- Format: `shared/pack.ts`. `answer` is always accepted; `exact[]` = other accepted answers. Per-question `time`, `points`, `hint`, `explain`, `effect`, `opts` (blur/zoom/pixelate/reveal, audio clip start/end/loop/rate…).
- Script questions: free JS run client-side with `api` (doc: SCRIPT_API_DOC in client/question-types/script.tsx). No sandbox on purpose (friends only).
- New question type: `client/question-types/<type>.tsx` receiving `QProps` ({ q, phase, clear }), + add it to TYPES in client/studio/pack-editor.tsx.
- New game sound event: add to SOUND_EVENTS in client/sfx.ts + file in client/public/sfx/.

## Debug
- `?debug` in the URL: state JSON overlay, dev settings (bots), feature errors in chat.
- `/log/CODE`: settings, players, current question (with answers), feature state, last 500 events.
- `npm run dev` (wrangler dev on :8787) then `npm run sim` in another shell (`PACKS=a,b` to pick packs): plays a full game with bots and fails on any server error.

## Deploy
Push to `main` → Cloudflare Workers Builds (repo connected in the dashboard) runs `npm run build` + `npx wrangler deploy`. GitHub Action only type-checks. Live: https://hella-party.arietbatiment5.workers.dev
