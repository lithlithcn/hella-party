export { Room } from './room';
export { Library } from './library';
import { library, type Env } from './library';

const LETTERS = 'BCDFGHJKLMNPQRSTVWXZ';

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const p = url.pathname;
    if (p === '/api/new') {
      const code = Array.from({ length: 4 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join('');
      return Response.json({ code });
    }
    if (p === '/api/wiki-check') { // debug: every wiki: image source of built-in packs (page /check)
      const { PACKS } = await import('./packs');
      return Response.json(Object.values(PACKS).flatMap(pk => pk.questions.filter(q => q.src?.startsWith('wiki:')).map(q => ({ pack: pk.id, answer: q.answer, src: q.src }))));
    }
    // ── library ──
    if (p === '/api/packs' && req.method === 'GET') return Response.json(await library(env).list());
    let m = p.match(/^\/api\/packs\/([a-z0-9-]{1,40})$/);
    if (m) {
      const lib = library(env);
      if (req.method === 'GET') { const pk = await lib.get(m[1]); return pk ? Response.json(pk) : new Response('not found', { status: 404 }); }
      const body = await req.json<any>().catch(() => ({}));
      if (req.method === 'PUT') return Response.json(await lib.put({ ...body.pack, id: m[1] }, String(body.key ?? '')));
      if (req.method === 'DELETE') return Response.json(await lib.remove(m[1], String(body.key ?? '')));
    }
    m = p.match(/^\/api\/media\/([a-f0-9]{64})(\.\w+)?$/);
    if (m) {
      const lib = library(env);
      if (req.method === 'HEAD') return new Response(null, { status: (await lib.hasMedia(m[1])) ? 200 : 404 });
      if (req.method === 'PUT') return Response.json(await lib.putMedia(m[1], req.headers.get('content-type') ?? 'application/octet-stream', await req.arrayBuffer()));
      const f = await lib.getMedia(m[1]);
      if (!f) return new Response('not found', { status: 404 });
      return new Response(f.data as unknown as BodyInit, { headers: { 'content-type': f.type, 'cache-control': 'public, max-age=31536000, immutable', 'accept-ranges': 'none' } });
    }
    // ── rooms ──
    const r = p.match(/^\/(ws|log)\/([A-Z]{4})$/);
    if (r) return env.ROOM.get(env.ROOM.idFromName(r[2])).fetch(req);
    return env.ASSETS.fetch(req);
  },
};
