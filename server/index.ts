export { Room } from './room';

interface Env { ROOM: DurableObjectNamespace; ASSETS: Fetcher }

const LETTERS = 'BCDFGHJKLMNPQRSTVWXZ';

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/api/new') {
      const code = Array.from({ length: 4 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join('');
      return Response.json({ code });
    }
    const m = url.pathname.match(/^\/(ws|log)\/([A-Z]{4})$/);
    if (m) return env.ROOM.get(env.ROOM.idFromName(m[2])).fetch(req);
    return env.ASSETS.fetch(req);
  },
};
