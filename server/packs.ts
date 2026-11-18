// Content packs: content/packs/<id>/pack.json + media/. Registered by scripts/gen.mjs.
import { RAW_PACKS } from './_gen/packs';

export interface Question {
  key: string;        // "<pack>/<id>", unique across packs
  pack: string;
  id: string;
  type: string;       // client/question-types/<type>.tsx
  prompt: string;
  src?: string;       // media URL
  text?: string;
  data?: any;         // free-form, for custom question types / scripts
  answer: string;     // displayed at reveal
  exact: string[];
  partial?: string[];
  effect?: string;    // special effect id, used by features
}

export interface Pack { id: string; name: string; questions: Question[] }

const media = (pack: string, src?: string) => (src && !/^(https?:|\/)/.test(src) ? `/packs/${pack}/${src}` : src);

export const PACKS: Record<string, Pack> = Object.fromEntries(
  RAW_PACKS.map((p: any) => [p.id, {
    id: p.id,
    name: p.name,
    questions: p.questions.map((q: any) => ({ ...q, key: `${p.id}/${q.id}`, pack: p.id, type: q.type ?? 'image', prompt: q.prompt ?? p.prompt, src: media(p.id, q.src) })),
  }]),
);
