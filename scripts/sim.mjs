// End-to-end smoke test against a running server (default: wrangler dev on :8787).
// PACKS=flags,my-pack node scripts/sim.mjs [baseUrl]  → plays a short game: A answers right (cheats via /log), B answers wrong, 2 bots.
import WebSocket from 'ws';

const base = process.argv[2] ?? 'http://localhost:8787';
const code = (await (await fetch(`${base}/api/new`)).json()).code;
const wsBase = base.replace(/^http/, 'ws');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fail = msg => { console.error('❌', msg); process.exit(1); };

function client(id, name) {
  const ws = new WebSocket(`${wsBase}/ws/${code}`);
  const c = { ws, s: null, fx: [], send: m => ws.send(JSON.stringify(m)) };
  ws.on('open', () => c.send({ t: 'hello', id, name }));
  ws.on('message', raw => { const m = JSON.parse(raw); if (m.t === 'state') c.s = m.s; if (m.t === 'fx') c.fx.push(m); });
  return c;
}

const A = client('sim-a', 'Alice'), B = client('sim-b', 'Bob');
await sleep(500);
if (!A.s?.players.find(p => p.id === 'sim-a')?.leader) fail('Alice should be leader');
A.send({ t: 'settings', patch: { answerTime: 5, revealTime: 1, 'goal.score': 40, 'bots.count': 2, 'bots.skill': 50, ...(process.env.PACKS ? { packs: process.env.PACKS.split(',') } : {}) } });
await sleep(200);
A.send({ t: 'start' });

let lastRound = 0;
const t0 = Date.now();
while (Date.now() - t0 < 60000) {
  await sleep(150);
  const s = A.s;
  if (s.status === 'ended') break;
  if (s.phase?.name === 'question' && s.round !== lastRound) {
    lastRound = s.round;
    const log = await (await fetch(`${base}/log/${code}`)).json();
    await sleep(300 + Math.random() * 1500);
    A.send({ t: 'answer', text: log.question.exact[0] });
    B.send({ t: 'answer', text: 'pas du tout' });
    await sleep(100);
    const me = A.s.players.find(p => p.id === 'sim-a');
    console.log(`#${s.round} ${log.question.answer.padEnd(22)} A=${me.score} found=${me.found?.grade} | ${A.s.players.map(p => `${p.name}:${p.score}`).join(' ')}`);
  }
}
const s = A.s;
if (s.status !== 'ended') fail(`game did not end (status ${s.status})`);
if (!s.winners.includes('sim-a') && !s.winners.length) fail('no winner');
if (!A.fx.some(f => f.kind === 'answer' && f.data.ok)) fail('A never got a correct answer fx');
if (!B.fx.some(f => f.kind === 'answer' && !f.data.ok)) fail('B never got a wrong answer fx');
const errors = (await (await fetch(`${base}/log/${code}`)).json()).log.filter(l => l.ev === 'error');
if (errors.length) fail(`server errors: ${JSON.stringify(errors)}`);
console.log(`✅ winners: ${s.winners.map(id => s.players.find(p => p.id === id)?.name)} after ${s.round} rounds`);
process.exit(0);
