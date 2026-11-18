import { useEffect, useMemo, useState } from 'preact/hooks';
import type { MediaOpts, PackFile, PackQuestion, QuestionType } from '../../shared/pack';
import type { PublicQuestion } from '../../shared/protocol';
import { judge } from '../../shared/answer';
import { QT } from '../ui/stage';
import { SCRIPT_API_DOC, scriptBridge } from '../question-types/script';
import { answerFromFile, mediaUrl, mediaUrlSync, newQuestion, packFiles, putMedia, typeFromFile } from './model';
import { Check, Chips, Drop, Field, Num, Range, Select, Text } from './widgets';

const TYPES: [QuestionType, string][] = [['image', '🖼️ Image'], ['audio', '🔊 Son / musique'], ['video', '🎬 Vidéo'], ['text', '📝 Texte'], ['script', '🧩 Script']];
const ICON: Record<string, string> = { image: '🖼️', audio: '🔊', video: '🎬', text: '📝', script: '🧩' };
const EFFECTS = ['double', 'gel', 'flou', 'vol'];
const SCRIPT_TEMPLATE = `// Exemple : un carré qui traverse l'écran, il faut deviner sa couleur
const { ctx, w, h } = api;
api.onFrame(t => {
  ctx.fillStyle = '#120a24'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'tomato';
  ctx.fillRect((t * 120) % w, h / 2 - 30, 60, 60);
});
`;

interface Props { pack: PackFile; change: (p: PackFile) => void; optimize: boolean; allTags: string[] }

export function PackEditor({ pack, change, optimize, allTags }: Props) {
  const [sel, setSel] = useState<string | null>(pack.questions[0]?.id ?? null);
  const [search, setSearch] = useState('');
  const [tag, setTag] = useState('');
  const [, bump] = useState(0);
  const set = (patch: Partial<PackFile>) => change({ ...pack, ...patch });
  const setQ = (id: string, patch: Partial<PackQuestion>) => set({ questions: pack.questions.map(q => (q.id === id ? { ...q, ...patch } : q)) });

  // preload blob URLs for thumbnails / preview
  useEffect(() => { Promise.all(pack.questions.map(q => mediaUrl(pack.id, q.src))).then(() => bump(x => x + 1)); }, [pack.id, pack.questions.length]);

  const tags = useMemo(() => [...new Set(pack.questions.flatMap(q => q.tags ?? []))].sort(), [pack.questions]);
  const shown = pack.questions.filter(q =>
    (!tag || q.tags?.includes(tag)) &&
    (!search || `${q.answer} ${q.exact.join(' ')} ${q.text ?? ''}`.toLowerCase().includes(search.toLowerCase())));
  const cur = pack.questions.find(q => q.id === sel);

  const addFiles = async (files: File[]) => {
    const added: PackQuestion[] = [];
    for (const f of files) {
      const q = newQuestion(answerFromFile(f.name), typeFromFile(f));
      q.src = await putMedia(pack, f, f.name, optimize);
      added.push(q);
    }
    if (!added.length) return;
    set({ questions: [...pack.questions, ...added] });
    setSel(added[0].id);
  };
  const addBlank = (type: QuestionType) => {
    const q = newQuestion('', type);
    if (type === 'script') q.script = SCRIPT_TEMPLATE;
    set({ questions: [...pack.questions, q] });
    setSel(q.id);
  };
  const move = (id: string, d: number) => {
    const qs = [...pack.questions], i = qs.findIndex(q => q.id === id), j = i + d;
    if (j < 0 || j >= qs.length) return;
    [qs[i], qs[j]] = [qs[j], qs[i]];
    set({ questions: qs });
  };

  return (
    <div class="pack-editor">
      <section class="card meta">
        <div class="meta-head">
          <input class="emoji-in" value={pack.emoji} maxLength={4} onInput={e => set({ emoji: (e.target as HTMLInputElement).value })} />
          <input class="title-in" value={pack.name} placeholder="Nom du pack" onInput={e => set({ name: (e.target as HTMLInputElement).value })} />
          <input type="color" value={pack.color ?? '#ff3d9a'} onInput={e => set({ color: (e.target as HTMLInputElement).value })} title="Couleur du pack" />
        </div>
        <div class="grid">
          <Field label="Question par défaut" hint="Affichée au-dessus de chaque contenu, sauf si la question a la sienne"><Text value={pack.prompt} set={v => set({ prompt: v })} placeholder="Quel est ce film ?" /></Field>
          <Field label="Auteur"><Text value={pack.author} set={v => set({ author: v })} placeholder="HKN" /></Field>
          <Field label="Tags du pack" wide><Chips value={pack.tags} set={v => set({ tags: v })} placeholder="films, années 2000…" suggest={allTags} /></Field>
          <Field label="Description" wide><Text area value={pack.description} set={v => set({ description: v })} placeholder="De quoi parle ce pack ?" /></Field>
        </div>
        <small class="muted">ID : {pack.id} · {pack.questions.length} questions</small>
      </section>

      <section class="card">
        <div class="toolbar">
          <Drop onFiles={addFiles} multiple accept="image/*,audio/*,video/*">
            ⬇️ Glisse des images / sons / vidéos ici <small>(1 fichier = 1 question, réponse = nom du fichier)</small>
          </Drop>
          <div class="add-row">{TYPES.map(([t, l]) => <button class="btn ghost small" onClick={() => addBlank(t)}>+ {l}</button>)}</div>
          <div class="add-row">
            <input placeholder="🔎 Chercher…" value={search} onInput={e => setSearch((e.target as HTMLInputElement).value)} />
            <select value={tag} onChange={e => setTag((e.target as HTMLSelectElement).value)}>
              <option value="">Tous les tags</option>{tags.map(t => <option value={t}>{t}</option>)}
            </select>
            <small class="muted">{shown.length}/{pack.questions.length}</small>
          </div>
        </div>
        <div class="qlist">
          {shown.map(q => {
            const u = q.type !== 'audio' ? mediaUrlSync(pack.id, q.src) : undefined;
            return (
              <div key={q.id} class={`qrow ${q.id === sel ? 'on' : ''}`} onClick={() => setSel(q.id)}>
                <div class="qthumb">{u && (q.type ?? 'image') === 'image' ? <img src={u} /> : ICON[q.type ?? 'image']}</div>
                <div class="qmain">
                  <b>{q.answer || <i class="muted">sans réponse</i>}</b>
                  <small>{[...(q.tags ?? []), q.effect && `✨${q.effect}`, q.difficulty && '★'.repeat(q.difficulty)].filter(Boolean).join(' · ')}</small>
                </div>
                <div class="qbtns" onClick={e => e.stopPropagation()}>
                  <button onClick={() => move(q.id, -1)} title="Monter">↑</button>
                  <button onClick={() => move(q.id, 1)} title="Descendre">↓</button>
                  <button onClick={() => { const c = { ...structuredClone(q), id: `${q.id}-c` }; set({ questions: [...pack.questions, c] }); setSel(c.id); }} title="Dupliquer">⧉</button>
                  <button onClick={() => confirm(`Supprimer « ${q.answer} » ?`) && set({ questions: pack.questions.filter(x => x.id !== q.id) })} title="Supprimer">🗑</button>
                </div>
              </div>
            );
          })}
          {!pack.questions.length && <p class="muted">Aucune question. Glisse des fichiers ci-dessus ou ajoute une question vide.</p>}
        </div>
      </section>

      {cur && <QuestionEditor key={cur.id} pack={pack} q={cur} set={p => setQ(cur.id, p)} optimize={optimize} allTags={[...new Set([...tags, ...allTags])]} />}
    </div>
  );
}

function QuestionEditor({ pack, q, set, optimize, allTags }: { pack: PackFile; q: PackQuestion; set: (p: Partial<PackQuestion>) => void; optimize: boolean; allTags: string[] }) {
  const type = q.type ?? 'image';
  const o = q.opts ?? {};
  const setO = (patch: Partial<MediaOpts>) => set({ opts: { ...o, ...patch } });
  const isVisual = type === 'image' || type === 'video';
  const isTimed = type === 'audio' || type === 'video';
  const replaceMedia = async (files: File[]) => { const f = files[0]; if (f) set({ src: await putMedia(pack, f, f.name, optimize), type: type === 'text' || type === 'script' ? typeFromFile(f) : type }); };

  return (
    <section class="card qedit">
      <div class="qedit-form">
        <div class="grid">
          <Field label="Type"><Select value={type} set={v => set({ type: v, ...(v === 'script' && !q.script ? { script: SCRIPT_TEMPLATE } : {}) })} options={TYPES} /></Field>
          <Field label="Réponse affichée"><Text value={q.answer} set={v => set({ answer: v })} placeholder="Ex. Spider-Man" /></Field>
          <Field label="Autres réponses acceptées (exactes)" hint="Variantes, traductions, surnoms. Les accents, majuscules et petites fautes sont déjà tolérés." wide>
            <Chips value={q.exact} set={v => set({ exact: v })} placeholder="Spiderman, Peter Parker… (Entrée pour ajouter)" />
          </Field>
          <Field label="Réponses partielles (moins de points)" wide><Chips value={q.partial} set={v => set({ partial: v })} placeholder="Ex. Peter, Parker" /></Field>
          <Field label="Tags" wide><Chips value={q.tags} set={v => set({ tags: v })} placeholder="marvel, film, facile…" suggest={allTags} /></Field>
          {(type !== 'text') && (
            <Field label={type === 'script' ? 'Fichiers pour le script (optionnel)' : 'Fichier'} wide>
              <Drop onFiles={replaceMedia} accept={type === 'audio' ? 'audio/*' : type === 'video' ? 'video/*' : type === 'image' ? 'image/*' : undefined}>
                {q.src ? `📎 ${q.src} — cliquer / glisser pour remplacer` : '📎 Choisir ou glisser un fichier'}
              </Drop>
              <Text value={/^https?:/.test(q.src ?? '') ? q.src : ''} set={v => set({ src: v || undefined })} placeholder="…ou une URL https://" />
            </Field>
          )}
          {(type === 'text' || type === 'audio') && <Field label={type === 'text' ? 'Texte à afficher' : 'Légende (optionnel)'} wide><Text area value={q.text} set={v => set({ text: v })} placeholder={type === 'text' ? 'Une citation, une définition, un emoji 🍕🍍…' : ''} /></Field>}
          <Field label="Question (remplace celle du pack)"><Text value={q.prompt} set={v => set({ prompt: v || undefined })} placeholder={pack.prompt} /></Field>
          <Field label="Indice (à mi-temps)"><Text value={q.hint} set={v => set({ hint: v || undefined })} placeholder="Ex. Sorti en 2002" /></Field>
          <Field label="Explication (à la révélation)" wide><Text value={q.explain} set={v => set({ explain: v || undefined })} placeholder="Un fun fact…" /></Field>
          <Field label="Difficulté"><Range value={q.difficulty} set={v => set({ difficulty: v })} min={0} max={5} step={1} fmt={v => (v ? '★'.repeat(v) : '—')} /></Field>
          <Field label="Temps (s)" hint="Vide = temps de la salle"><Num value={q.time} set={v => set({ time: v })} min={3} max={120} placeholder="salle" /></Field>
          <Field label="Multiplicateur de points"><Num value={q.points} set={v => set({ points: v })} min={0} max={10} step={0.5} placeholder="×1" /></Field>
          <Field label="Effet spécial ✨" hint="Déclenché pour le premier qui trouve (quand la mécanique existe)">
            <input list="fx-list" value={q.effect ?? ''} onInput={e => set({ effect: (e.target as HTMLInputElement).value || undefined })} placeholder="aucun" />
            <datalist id="fx-list">{EFFECTS.map(e => <option value={e} />)}</datalist>
          </Field>
        </div>

        {isVisual && (
          <fieldset class="opts"><legend>Effets visuels</legend>
            <div class="grid">
              <Field label="Révélation progressive">
                <Select value={o.reveal ?? 'none'} set={v => setO({ reveal: v })} options={[['none', 'Aucune'], ['unblur', 'Se défloute'], ['unzoom', 'Se dézoome'], ['unpixelate', 'Se dépixelise'], ['spotlight', 'Projecteur qui s\'agrandit']]} />
              </Field>
              <Field label="Flou"><Range value={o.blur} set={v => setO({ blur: v })} min={0} max={40} step={1} fmt={v => `${v}px`} /></Field>
              <Field label="Pixelisation"><Range value={o.pixelate} set={v => setO({ pixelate: v })} min={0} max={0.99} step={0.01} fmt={v => `${Math.round(v * 100)}%`} /></Field>
              <Field label="Zoom"><Range value={o.zoom} set={v => setO({ zoom: v })} min={1} max={8} step={0.1} fmt={v => `×${v}`} /></Field>
              <Field label="Point de zoom X / Y"><span class="range2"><Range value={o.zoomX} set={v => setO({ zoomX: v })} min={0} max={100} step={1} fmt={v => `${v ?? 50}%`} /><Range value={o.zoomY} set={v => setO({ zoomY: v })} min={0} max={100} step={1} fmt={v => `${v}%`} /></span></Field>
              <Field label="Rotation"><Range value={o.rotate} set={v => setO({ rotate: v })} min={0} max={359} step={1} fmt={v => `${v}°`} /></Field>
              <Field label="Transformations"><span class="checks"><Check value={o.grayscale} set={v => setO({ grayscale: v || undefined })} label="Noir & blanc" /><Check value={o.invert} set={v => setO({ invert: v || undefined })} label="Couleurs inversées" /><Check value={o.flip} set={v => setO({ flip: v || undefined })} label="Miroir" /></span></Field>
            </div>
          </fieldset>
        )}
        {isTimed && (
          <fieldset class="opts"><legend>Lecture</legend>
            <div class="grid">
              <Field label="Début (s)"><Num value={o.start} set={v => setO({ start: v })} min={0} step={0.1} placeholder="0" /></Field>
              <Field label="Fin (s)" hint="Vide = jusqu'au bout"><Num value={o.end} set={v => setO({ end: v })} min={0} step={0.1} placeholder="fin" /></Field>
              <Field label="Volume"><Range value={o.volume} set={v => setO({ volume: v })} min={0} max={1} step={0.05} fmt={v => `${Math.round((v ?? 1) * 100)}%`} /></Field>
              <Field label="Vitesse"><Range value={o.rate} set={v => setO({ rate: v })} min={0.25} max={3} step={0.05} fmt={v => `×${v ?? 1}`} /></Field>
              <Field label="Options"><span class="checks"><Check value={o.loop} set={v => setO({ loop: v || undefined })} label="En boucle" />{type === 'video' && <Check value={o.hideVideo} set={v => setO({ hideVideo: v || undefined })} label="Cacher l'image (son seul)" />}</span></Field>
            </div>
          </fieldset>
        )}
        {type === 'script' && (
          <fieldset class="opts"><legend>Script (JavaScript)</legend>
            <Text area mono value={q.script} set={v => set({ script: v })} />
            <Field label="Données libres (JSON, lues par api.q.data)" wide>
              <Text area mono value={q.data === undefined ? '' : JSON.stringify(q.data, null, 1)} set={v => { try { set({ data: v.trim() ? JSON.parse(v) : undefined }); } catch { /* keep typing */ } }} />
            </Field>
            <ScriptFiles pack={pack} optimize={optimize} insert={name => set({ script: `${q.script ?? ''}\nconst img = await api.image('${name}');` })} />
            <details><summary>📖 Ce que le script peut faire (api)</summary><pre class="api-doc">{SCRIPT_API_DOC}</pre></details>
          </fieldset>
        )}
      </div>
      <Preview pack={pack} q={q} />
    </section>
  );
}

function Preview({ pack, q }: { pack: PackFile; q: PackQuestion }) {
  const [run, setRun] = useState(0);
  const [clear, setClear] = useState(false);
  const [test, setTest] = useState('');
  const [src, setSrc] = useState<string | undefined>();
  useEffect(() => { mediaUrl(pack.id, q.src).then(setSrc); }, [q.src]);
  useEffect(() => { scriptBridge.answer = t => setTest(t); }, []);
  const dur = (q.time || 20) * 1000;
  const phase = useMemo(() => { const now = Date.now(); return { name: 'question', startedAt: now, endsAt: now + dur }; }, [run, dur]);
  const pub: PublicQuestion = { id: `${q.id}#${run}`, type: q.type ?? 'image', prompt: q.prompt || pack.prompt, src, text: q.text, opts: q.opts, hint: q.hint, script: q.script, data: q.data, tags: q.tags };
  const T = QT[pub.type] ?? QT.text;
  const grade = test ? judge(test, { exact: [q.answer, ...q.exact], partial: q.partial }) : undefined;
  return (
    <div class="preview">
      <div class="preview-head">
        <b>Aperçu</b>
        <button class="btn ghost small" onClick={() => { setClear(false); setRun(r => r + 1); }}>▶ Rejouer</button>
        <Check value={clear} set={setClear} label="Révélation" />
      </div>
      <div class="stage preview-stage">
        <div class="q-prompt">{pub.prompt}</div>
        <div class="q-media"><T key={pub.id} q={pub} phase={clear ? null : phase} clear={clear} /></div>
        {clear && <div class="reveal"><div class="reveal-answer">{q.answer || '?'}</div>{q.explain && <div class="reveal-explain">{q.explain}</div>}</div>}
      </div>
      <input class="test-answer" placeholder="Teste une réponse…" value={test} onInput={e => setTest((e.target as HTMLInputElement).value)} />
      {test && <div class={`test-result ${grade ?? 'no'}`}>{grade === 'exact' ? '✅ Exacte' : grade === 'partial' ? '🟡 Partielle' : grade === 'approx' ? '🟦 Acceptée (petite faute)' : '❌ Refusée'}</div>}
      {q.hint && <small class="muted">💡 Indice : {q.hint}</small>}
    </div>
  );
}

/** Extra files usable from scripts with api.asset / api.image / api.sound. */
function ScriptFiles({ pack, optimize, insert }: { pack: PackFile; optimize: boolean; insert: (name: string) => void }) {
  const [files, setFiles] = useState<string[]>([]);
  const refresh = () => packFiles(pack).then(setFiles);
  useEffect(() => { refresh(); }, [pack.id]);
  return (
    <Field label="Fichiers du pack pour tes scripts" hint="Clique un nom pour l'insérer dans le script. Seuls les fichiers cités dans un script ou utilisés par une question sont exportés." wide>
      <Drop multiple onFiles={async fs => { for (const f of fs) await putMedia(pack, f, f.name, optimize); refresh(); }}>+ Ajouter des fichiers (images, sons…)</Drop>
      <div class="chips">{files.map(f => <button class="chip" onClick={() => insert(f)} title="Insérer dans le script">{f}</button>)}</div>
    </Field>
  );
}
