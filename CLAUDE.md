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
server/packs.ts         Question type + pack loading (resolvePack also used for library packs)
server/library.ts       Library DO ("main", SQLite): Studio-published packs + content-addressed chunked media (/api/packs, /api/media)
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
- Difficulty: `difficulty` 1 facile / 2 moyen / 3 difficile (+ same tag). Room setting `maxDifficulty` (default 2) filters questions. Pack-level `opts` = default display options (e.g. `{reveal:'unpixelate'}` for posters/logos that show the title).
- Owner rules for content: IMAGES (or sounds) only — no text/emoji-rebus questions (text may only be a hint). Never an image that shows the answer (covers, posters, logos/wordmarks, crests, packaging): use character art / photos instead (e.g. 'De quel animé vient ce perso ?'). Players flag bad ones with 🚩 → GET /api/reports. Accessible/fun first; religious content OK (culture); nothing sexual. No photos of real people (I can't add them, even as links) — he may add them himself in the Studio.
- Owner rule for EVERY new question: fill `exact[]` generously with fitting shortcuts (short name, nickname, abbreviation, common spellings, EN/other-language name) and good tags — don't rely on the generic shortcuts in shared/answer.ts.
- Script questions: free JS run client-side with `api` (doc: SCRIPT_API_DOC in client/question-types/script.tsx). No sandbox on purpose (friends only).
- New question type: `client/question-types/<type>.tsx` receiving `QProps` ({ q, phase, clear }), + add it to TYPES in client/studio/pack-editor.tsx.
- New game sound event: add to SOUND_EVENTS in client/sfx.ts + file in client/public/sfx/.

## Online library (packs from the Studio, no GitHub step)
- Studio "Publier en ligne" → uploads media (sha-256, dedup) to /api/media/<hash>, then PUT /api/packs/<slug(name)> with a per-device key (localStorage) — same name by someone else is refused.
- Room fetches the library list (cached 10 s) for the lobby, loads selected library packs at `start` into `game.extra`.
- Media sources: file in media/, absolute URL, or `wiki:Title` / `wiki:en:Title` = lead image of a Wikipedia article, resolved in the browser (client/question-types/common.ts resolveWiki). Built-in image packs use wiki: (zero repo weight). `/check` page lists broken wiki images.
- wiki: images are DOWNLOADED SERVER-side before a question is asked (Room io.prepare → Library.wiki: summary API → 960px thumb (or original if smaller, max 1.5 MB) → stored as /api/media/<hash>, cache table wiki4 shared by all rooms). Players only ever load same-origin images. Unresolvable → question skipped; Game.AHEAD (4) questions are resolved in advance (engine.prepareAhead) and clients get fx 'preload' for each. If every connected human reports {t:'mediaError'} the question is replaced silently (engine.mediaError).
- Phones ((pointer: coarse)): the answer field is never auto-focused (keyboard would hide the image); store.focusHandoff blurs at question start and at the reveal (no jump to the chat on phones). Hits: fx.hit(1-3)/recoil() = one-shot stage shake (+1-frame invert for 2-3).
- Perf (must run on the weakest phones): static background; correct answer = white flash (opacity) + hue-rotate +15° (client/ui/fx.ts). No backdrop-filter, no blur filters, no infinite animations, never animate a custom property on :root. Timer bar = one CSS animation; unblur/unzoom = one CSS transition; JS-stepped effects (pixelate/spotlight) at 4 fps max.
- Room setting `mediaEffects` (bool) strips the packs' zoom/blur/pixel/reveal opts; `imageReveal` (none/unpixelate/unblur/unzoom/random) adds a reveal to image questions without one (publicQuestion). Reveals end 1 s before the timer (common.revealEnd).
- Answer box is a <form> (Enter on phones submits, focus stays); during the reveal it collapses and focus moves to the chat input BEFORE render (store.focusHandoff) so the phone keyboard stays open.
- Bubbles under player cards (engine.guesses): wrong guesses; once a player has the exact answer the answer box sends `say` (shown only to finders until the reveal); at the reveal each finder's bubble shows the exact text they typed (engine.foundText); during the reveal chat lines also go to the bubble. 3 lines max (line-clamp). Bubbles are also logged in the chat (io.bubble → Room.chatLine, `bubble:true`, finders-only while the question runs).
- Chat: player messages get a server id; `{t:'chat', reply:id}` quotes a recent one (Room keeps last 200). Player colours: engine assigns the smallest free slot (Player.color); client/ui/util slotColor = 12 rainbow hues before any variant.
- Big rooms (>8 sockets): state snapshots are batched every 40 ms (50 players answering at once = 1 snapshot, not 50).
- Avatars: 128px WebP data URL, sent in hello / {t:'avatar'}; Room relays them separately from state (never inside the state snapshot).

## Features in place
- `scoring`, `goal`, `bots` (debug). `streak`: x1, x2… combo badge (exact answers in a row; fx 'streak'; chat at every 5). `chain` (option, off by default): when every connected human found the same N questions (default 5), they come back as a quick-fire round (intro phase 'chain.intro', forced questions with chain.time, points ÷2.5).

## TODO (owner asked, later)
- Shortcuts are automatic (no per-question data needed):
  - shared/answer.ts expand() → exact: subtitle/parentheses/article stripped, roman↔arabic, acronyms (tlou, lotr, sda, jjba, ff7, botw), ALIAS table; guessed() → partial: head noun (flûte à bec → flûte) unless NOHEAD.
  - Keep Library.names under ~45 subrequests (Workers free limit 50 per invocation).
  - Server: Room io.prepare adds Library.names(q.aliasTitle) to q.exact = the Wikipedia page's redirects + titles in en/fr/es/it/de/pt (+ their redirects), cached 30 days (table names8, owner wants FR + EN only: fr/en Wikipedia redirects + fr/en titles, Wikidata fr/en labels+aliases + name properties P1813 short name, P1449 nickname, P742, P1843 common name, P1448, P1476; Fandom redirects via P6262 (≤8 wikis); ConceptNet fr/en synonyms; fr+en Wiktionary synonyms/abbreviations/variants sections; AniList titles+synonyms (kind anime); games (kind game: PCGamingWiki, StrategyWiki, SmashWiki redirects (one wiki for all Nintendo + guest franchises)); series (kind series: TVMaze akas); kinds per pack in room.ts NAME_KIND) — max ~15 subrequests. aliasTitle = the pictured wiki page, or `fr:<answer>` (packs with `aliasFrom:"answer"`: by-character packs, non-wiki images). Debug: /api/names?k=fr:Tomate.
  - Still useful: hand-written `exact[]` for nicknames Wikipedia doesn't redirect.
- Kick: leader ✕ on a card → {t:'kick'}; Room refuses that id for the room's lifetime. Game end waits for the reveal (engine.endAfterReveal).

## Debug
- `?debug` in the URL: state JSON overlay, dev settings (bots), feature errors in chat.
- `/log/CODE`: settings, players, current question (with answers), feature state, last 500 events.
- `npm run dev` (wrangler dev on :8787) then `npm run sim` in another shell (`PACKS=a,b` to pick packs): plays a full game with bots and fails on any server error.

## Deploy
Push to `main` → Cloudflare Workers Builds (repo connected in the dashboard) runs `npm run build` + `npx wrangler deploy`. GitHub Action only type-checks. Live: https://hella-party.arietbatiment5.workers.dev
