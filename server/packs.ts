// Content packs: content/packs/<id>/pack.json + media/. Registered by scripts/gen.mjs.
import { RAW_PACKS } from './_gen/packs';
import type { PackFile, PackQuestion } from '../shared/pack';

/** Server-side question: the pack question, resolved (absolute media URL, prompt, type). */
export interface Question extends Omit<PackQuestion, "type"> {
  key: string;        // "<pack>/<id>", unique across packs
  pack: string;
  type: string;       // client/question-types/<type>.tsx
  prompt: string;
}

export interface Pack { id: string; name: string; tags: string[]; questions: Question[] }

const media = (pack: string, src?: string) => (src && !/^(https?:|\/)/.test(src) ? `/packs/${pack}/${src}` : src);

export const PACKS: Record<string, Pack> = Object.fromEntries(
  (RAW_PACKS as PackFile[]).map(p => [p.id, {
    id: p.id,
    name: p.name,
    tags: p.tags ?? [],
    questions: p.questions.map(q => ({
      ...q, key: `${p.id}/${q.id}`, pack: p.id, type: q.type ?? 'image', prompt: q.prompt || p.prompt,
      src: media(p.id, q.src), exact: [q.answer, ...(q.exact ?? [])],
    })),
  }]),
);
