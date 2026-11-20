// Studio: create packs (images, sounds, music, videos, texts, scripts) and game sounds, then export a zip
// that is added to the repo as content/packs/<id>/ (see CLAUDE.md "Adding content").
import { useEffect, useRef, useState } from 'preact/hooks';
import type { PackFile } from '../../shared/pack';
import { assets } from '../question-types/common';
import { Logo } from '../ui/util';
import { mediaUrlSync, newPack, packs } from './model';
import { PackEditor } from './pack-editor';
import { SoundsEditor } from './sounds';
import { exportPacks, importZip } from './zip';
import { packSize, publish, publishedId, unpublish } from './publish';
import { Check } from './widgets';
import './studio.css';

export default function Studio() {
  const [list, setList] = useState<PackFile[]>([]);
  const [cur, setCur] = useState<PackFile | null>(null);
  const [tab, setTab] = useState<'packs' | 'sounds'>('packs');
  const [saved, setSaved] = useState(true);
  const [optimize, setOptimize] = useState(localStorage.getItem('hp.optimize') !== '0');
  const timer = useRef<any>(null);
  const [pub, setPub] = useState('');
  const [size, setSize] = useState(0);
  useEffect(() => { if (cur) packSize(cur).then(setSize); }, [cur?.id, cur?.questions.length]);

  const reload = async (selectId?: string) => {
    const l = await packs.list();
    setList(l);
    if (selectId !== undefined) setCur(l.find(p => p.id === selectId) ?? null);
  };
  useEffect(() => { reload(); }, []);
  // script assets resolve to this device's blob URLs in previews
  useEffect(() => { const prev = assets.resolve; assets.resolve = (q, n) => (cur && mediaUrlSync(cur.id, n)) || prev(q, n); return () => { assets.resolve = prev; }; }, [cur?.id]);
  useEffect(() => { const f = (e: BeforeUnloadEvent) => { if (!saved) e.preventDefault(); }; addEventListener('beforeunload', f); return () => removeEventListener('beforeunload', f); }, [saved]);

  const change = (p: PackFile) => {
    setCur(p); setSaved(false);
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => { await packs.save(p); setSaved(true); setList(l => l.map(x => (x.id === p.id ? p : x))); }, 400);
  };
  const create = async () => { const p = newPack(); await packs.save(p); await reload(p.id); setTab('packs'); };
  const onImport = async (f?: File) => {
    if (!f) return;
    try { const names = await importZip(f); alert(names.length ? `Importé : ${names.join(', ')}` : 'Aucun pack trouvé dans ce fichier.'); await reload(); }
    catch (e) { alert(`Fichier illisible : ${e}`); }
  };
  const allTags = [...new Set(list.flatMap(p => [...(p.tags ?? []), ...p.questions.flatMap(q => q.tags ?? [])]))].sort();

  return (
    <div class="studio">
      <header class="topbar">
        <a href="/" class="topbar-logo"><Logo /></a>
        <h1 class="studio-title">Studio</h1>
        <nav class="tabs">
          <button class={tab === 'packs' ? 'on' : ''} onClick={() => setTab('packs')}>📦 Packs</button>
          <button class={tab === 'sounds' ? 'on' : ''} onClick={() => setTab('sounds')}>🔊 Sons du jeu</button>
        </nav>
        <span class="grow" />
        <small class="muted">{saved ? '✓ Enregistré sur cet appareil' : 'Enregistrement…'}</small>
      </header>

      {tab === 'sounds' ? <SoundsEditor /> : (
        <div class="studio-body">
          <aside class="card packs-side">
            <button class="btn" onClick={create}>+ Nouveau pack</button>
            <label class="btn ghost small file-btn">📥 Importer (.zip / .json)<input type="file" accept=".zip,.json" onChange={e => { const t = e.target as HTMLInputElement; onImport(t.files?.[0]); t.value = ''; }} /></label>
            <div class="pack-list">
              {list.map(p => (
                <button key={p.id} class={`pack-item ${cur?.id === p.id ? 'on' : ''}`} style={{ borderColor: p.color }} onClick={() => setCur(p)}>
                  <span>{p.emoji}</span><b>{p.name}</b><small>{p.questions.length}</small>
                </button>
              ))}
              {!list.length && <p class="muted">Pas encore de pack.</p>}
            </div>
            {cur && <>
              <small class="muted">Fichiers : {(size / 1e6).toFixed(1)} Mo{size > 20e6 ? ' — lourd : préfère des liens (URL) pour les gros médias' : ''}</small>
              <button class="btn" disabled={!!pub && pub.endsWith('…')} onClick={async () => {
                try { await packs.save(cur); const id = await publish(cur, setPub); setPub(`✅ Publié ! Choisis « ${cur.name} » dans les réglages de ta salle (id : ${id}).`); }
                catch (e: any) { setPub(`❌ ${e.message ?? e}`); }
              }}>🌐 Publier en ligne</button>
              {localStorage.getItem(`hp.published.${cur.id}`) && <button class="btn ghost small" onClick={async () => { if (confirm('Retirer ce pack du jeu en ligne ?')) { await unpublish(cur); setPub('Pack retiré du jeu en ligne.'); } }}>Retirer du jeu en ligne</button>}
              {pub && <small class="pub-msg">{pub}</small>}
              <button class="btn ghost small" onClick={() => exportPacks([cur])}>📦 Exporter en .zip (pour GitHub)</button>
              <button class="btn ghost small" onClick={async () => { if (confirm(`Supprimer définitivement « ${cur.name} » et ses fichiers ?`)) { await packs.remove(cur.id); setCur(null); reload(); } }}>🗑 Supprimer ce pack</button>
            </>}
            {list.length > 1 && <button class="btn ghost small" onClick={() => exportPacks(list)}>📦 Tout exporter ({list.length})</button>}
            <Check value={optimize} set={v => { setOptimize(v); localStorage.setItem('hp.optimize', v ? '1' : '0'); }} label="Optimiser les images (≤1280px, WebP)" />
            <details class="help">
              <summary>Comment ajouter mon pack au jeu ?</summary>
              <ol>
                <li>Crée tes questions ici (tout est sauvegardé sur cet appareil).</li>
                <li><b>Publier en ligne</b> : le pack est tout de suite jouable, il apparaît dans les réglages de n'importe quelle salle (« Packs du Studio »). Republie après chaque modification.</li>
                <li><b>Exporter en .zip</b> : pour l'ajouter pour toujours au dépôt GitHub (envoie le fichier à Claude).</li>
                <li>Pour des packs légers : utilise des liens (URL) au lieu de fichiers, avec « Ajouter par liens ».</li>
              </ol>
            </details>
          </aside>
          {cur ? <PackEditor key={cur.id} pack={cur} change={change} optimize={optimize} allTags={allTags} />
            : <div class="card empty"><p>Choisis un pack à gauche ou crée-en un.</p></div>}
        </div>
      )}
    </div>
  );
}
