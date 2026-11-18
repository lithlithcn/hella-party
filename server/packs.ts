// Content packs: content/packs/<id>/pack.json + media/. Registered by scripts/gen.mjs.
import { RAW_PACKS } from './_gen/packs';
import type { PackFile, PackQuestion } from '../shared/pack';

/** Server-side question: the pack question, resolved (absolute media URL, prompt, type). */
export interface Question extends Omit<PackQuestion, "type"> {
  key: string;        // "<pack>/<id>", unique across packs
  pack: string;
  type: string;       // client/question-types/<type>.tsx
  prompt: string;
  media?: Record<string, string>; // library packs: file name → URL (for scripts)
}

export interface Pack { id: string; name: string; tags: string[]; questions: Question[] }

const media = (pack: string, src?: string) => (src && !/^(https?:|\/|wiki:)/.test(src) ? `/packs/${pack}/${src}` : src);

export function resolvePack(p: PackFile & { media?: Record<string, string> }): Pack {
  const map = p.media;
  return {
    id: p.id, name: p.name, tags: p.tags ?? [],
    questions: p.questions.map(q => ({
      ...q, key: `${p.id}/${q.id}`, pack: p.id, type: q.type ?? 'image', prompt: q.prompt || p.prompt,
      src: map && q.src && map[q.src] ? map[q.src] : media(p.id, q.src), exact: [q.answer, ...(q.exact ?? [])], media: map,
    })),
  };
}

export const PACKS: Record<string, Pack> = Object.fromEntries((RAW_PACKS as PackFile[]).map(p => [p.id, resolvePack(p)]));
export const PACK_META = Object.fromEntries((RAW_PACKS as PackFile[]).map(p => [p.id, { emoji: p.emoji, author: p.author, tags: p.tags }]));
