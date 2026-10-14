'use client';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Search, Copy, ArrowLeft, FileText, History } from 'lucide-react';
import type { QueryData } from './plugin';
import { MarkdownNote, noRefs, type Refs } from '@/components/home/markdown';

type Hit = { backend: string; id: string; vault: string; path: string; title: string; snippet: string; score: number };

function marked(text: string): ReactNode[] {
  return text.split('\u0001').flatMap((part, i) => {
    if (i === 0) return [part];
    const [m, rest] = part.split('\u0002');
    return [<mark key={i}>{m}</mark>, rest];
  });
}

export default function QueryView({ data }: { data: QueryData; fetchedAt: Date }) {
  const [q, setQ] = useState(data.q);
  const [scopes, setScopes] = useState<string[]>(data.vaults.map((v) => v.id));
  const [res, setRes] = useState<{ hits: Hit[]; ms: number; errors: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState<Hit | null>(data.open ? { backend: 'vault', id: `${data.open.vault}:${data.open.path}`, vault: data.open.vault, path: data.open.path, title: data.open.path.split('/').pop()!.replace(/\.md$/, ''), snippet: '', score: 0 } : null);
  const [doc, setDoc] = useState<{ body: string; refs: Refs } | null>(null);
  const [missing, setMissing] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const seq = useRef(0);
  const terms = (q.match(/[\p{L}\p{N}_]+/gu) || []).filter((t) => t.length > 1);

  useEffect(() => { setRecent(JSON.parse(localStorage.getItem('hd-query-recent') || '[]')); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === '/' && document.activeElement !== input.current) { e.preventDefault(); input.current?.focus(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const run = useCallback(async (text: string, sc: string[]) => {
    const id = ++seq.current;
    if (!text.trim()) { setRes(null); if (!data.open) setSel(null); return; }
    setBusy(true);
    try {
      const r = await fetch(`/api/query?q=${encodeURIComponent(text)}&scope=${sc.join(',')}`);
      const j = await r.json();
      if (id !== seq.current) return;
      setRes(j);
      setSel((cur) => (cur && data.open && cur.id === `${data.open.vault}:${data.open.path}` && !text.trim() ? cur : window.matchMedia('(min-width: 1024px)').matches ? (j.hits[0] ?? null) : null));
    } finally { if (id === seq.current) setBusy(false); }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => run(q, scopes), 140);
    return () => clearTimeout(t);
  }, [q, scopes, run]);

  useEffect(() => {
    if (!sel) { setDoc(null); return; }
    let live = true;
    setMissing(false);
    if (sel.vault === 'missing') { setDoc(null); setMissing(true); return; }
    fetch(`/api/query/doc?vault=${encodeURIComponent(sel.vault)}&path=${encodeURIComponent(sel.path)}`).then((r) => r.json()).then((j) => {
      if (!live) return;
      if (typeof j.body === 'string') setDoc({ body: j.body, refs: j.refs ?? noRefs }); else { setDoc(null); setMissing(true); }
    });
    return () => { live = false; };
  }, [sel]);

  const remember = () => {
    const t = q.trim();
    if (!t) return;
    const n = [t, ...recent.filter((r) => r !== t)].slice(0, 8);
    setRecent(n);
    localStorage.setItem('hd-query-recent', JSON.stringify(n));
  };
  const toggle = (id: string) => setScopes((s) => (s.includes(id) ? (s.length > 1 ? s.filter((x) => x !== id) : s) : [...s, id]));
  const total = data.vaults.reduce((s, v) => s + v.docs, 0);

  return (
    <main className={`hd-page q ${sel ? 'has-sel' : ''}`}>
      <header className="hd-top"><h1>Query</h1><span className="hd-spacer" /><span className="hd-meta">{total.toLocaleString()} notes indexed</span></header>
      <div className="q-bar">
        <Search aria-hidden className="hd-i" />
        <label htmlFor="q-in" className="hd-sr">Search notes</label>
        <input id="q-in" ref={input} autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') remember(); }} onBlur={remember}
          placeholder="Search your notes" autoComplete="off" spellCheck={false} />
        <kbd>/</kbd>
      </div>
      <div className="q-scopes" role="group" aria-label="Vaults">
        {data.vaults.map((v) => <button key={v.id} className="hd-chip" aria-pressed={scopes.includes(v.id)} onClick={() => toggle(v.id)}>{v.label} <span className="hd-faint num">{v.docs}</span></button>)}
        {res ? <span className="hd-meta" aria-live="polite">{res.hits.length} {res.hits.length === 1 ? 'result' : 'results'} in {res.ms} ms</span> : busy ? <span className="hd-meta">Searching</span> : null}
      </div>
      {res?.errors.length ? <p className="hd-faint">{res.errors.join('. ')}</p> : null}
      {!q.trim() && !sel ? (
        <section className="hd-panel q-recent" aria-labelledby="q-recent-h">
          <h2 id="q-recent-h">Recent searches</h2>
          {recent.length ? <ul>{recent.map((r) => <li key={r}><button onClick={() => setQ(r)}><History aria-hidden className="hd-i" />{r}</button></li>)}</ul>
            : <p className="hd-faint">Search both vaults by any words. Exact phrases rank first.</p>}
        </section>
      ) : res && !res.hits.length ? (
        <p className="hd-empty">No notes match. Try fewer words.</p>
      ) : (
        <div className="q-panes">
          <ol className="q-hits" aria-label="Results">
            {res?.hits.map((h) => (
              <li key={h.id}>
                <button aria-current={sel?.id === h.id ? 'true' : undefined} onClick={() => setSel(h)}>
                  <strong>{h.title}</strong>
                  <span className="q-path">{h.vault}/{h.path}</span>
                  <span className="q-snip">{marked(h.snippet)}</span>
                </button>
              </li>
            ))}
          </ol>
          <article className="hd-panel q-preview" aria-label="Preview">
            {sel ? (
              <>
                <div className="q-prev-head">
                  <button className="hd-btn ghost small q-back" onClick={() => setSel(null)}><ArrowLeft aria-hidden className="hd-i" />Results</button>
                  <h2>{sel.title}</h2>
                  <span className="q-path"><FileText aria-hidden className="hd-i" />{sel.vault}/{sel.path}</span>
                  <button className="hd-btn small" onClick={() => { navigator.clipboard?.writeText(`~/vaults/${sel.vault}/${sel.path}`); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
                    <Copy aria-hidden className="hd-i" />{copied ? 'Copied' : 'Copy path'}
                  </button>
                </div>
                {missing ? <p className="hd-empty">{sel.vault === 'missing' ? `No note yet called “${sel.path}”.` : 'This note could not be read.'}</p> : doc === null ? <span className="hd-skel" style={{ height: 200 }} /> : <MarkdownNote body={doc.body} refs={doc.refs} terms={terms} settings={data.md} />}
              </>
            ) : <p className="hd-empty">Pick a result to preview it.</p>}
          </article>
        </div>
      )}
    </main>
  );
}
