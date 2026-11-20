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
  /** Wikipedia page whose redirects + other-language titles become accepted answers ('lang:Title'). */
  aliasTitle?: string;
  /** Specialised name sources (Library.names kind), from the pack. */
  nameKind?: 'anime' | 'game' | 'series';
}

export interface Pack { id: string; name: string; tags: string[]; questions: Question[] }

const media = (pack: string, src?: string) => (src && !/^(https?:|\/|wiki:|url:|fandom:)/.test(src) ? `/packs/${pack}/${src}` : src);

export function resolvePack(p: PackFile & { media?: Record<string, string> }): Pack {
  const map = p.media;
  return {
    id: p.id, name: p.name, tags: p.tags ?? [],
    questions: p.questions.map(q => ({
      ...q, key: `${p.id}/${q.id}`, pack: p.id, type: q.type ?? 'image', prompt: q.prompt || p.prompt,
      src: map && q.src && map[q.src] ? map[q.src] : media(p.id, q.src), exact: [q.answer, ...(q.exact ?? [])], media: map,
      opts: p.opts || q.opts ? { ...p.opts, ...q.opts } : undefined,
      // the pictured page IS the answer, except in "by character" packs (picture = character, answer = work)
      nameKind: p.nameKind,
      aliasTitle: (q as any).aliasTitle ?? (q.src?.startsWith('wiki:') && p.aliasFrom !== 'answer' ? q.src.slice(5).replace(/^(?![a-z]{2,3}:)/, 'fr:') : `fr:${q.answer}`),
    })),
  };
}

export const PACKS: Record<string, Pack> = Object.fromEntries((RAW_PACKS as PackFile[]).map(p => [p.id, resolvePack(p)]));
export const PACK_META = Object.fromEntries((RAW_PACKS as PackFile[]).map(p => [p.id, { emoji: p.emoji, author: p.author, tags: p.tags }]));
