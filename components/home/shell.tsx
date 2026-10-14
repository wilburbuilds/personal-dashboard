'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion, MotionConfig } from 'motion/react';
import { Drawer } from 'vaul';
import { Command } from 'cmdk';
import { useTheme } from 'next-themes';
import { Search, Moon, FlaskConical, LayoutGrid, Keyboard } from 'lucide-react';
import { Dictate } from './mic';
import type { Attention } from '@/app/tabs/types';

export type NavItem = { id: string; title: string; href: string; icon: ReactNode; beta: boolean; badge: Attention | null; summary: string; refreshSeconds: number };

/** j/k targets: anything marked data-row, plus common list rows. */
const ROWS = '#content [data-row], #content .q-hits button, #content .lgi, #content .hd-panel li > a, #content .hd-panel tbody tr';
function moveRow(d: number) {
  const rows = [...document.querySelectorAll<HTMLElement>(ROWS)].filter((r) => r.offsetParent !== null);
  if (!rows.length) return false;
  const at = rows.findIndex((r) => r === document.activeElement || r.contains(document.activeElement));
  const next = rows[at === -1 ? (d > 0 ? 0 : rows.length - 1) : Math.min(rows.length - 1, Math.max(0, at + d))];
  if (!next.matches('a,button,input,[tabindex]')) next.tabIndex = -1;
  next.focus({ preventScroll: true });
  next.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  return true;
}

export const SHORTCUTS: [string[], string][] = [
  [['⌘', 'K'], 'Jump to a tab or search notes'],
  [['⌥', '↑'], 'Previous tab'],
  [['⌥', '↓'], 'Next tab'],
  [['⌘', '1–9'], 'Go to tab by position'],
  [['g', 't · h · b · s · p · q'], 'Go to Today, Health, Budget, Systems, Projects, Query'],
  [['/'], 'Focus search (opens Query when the tab has none)'],
  [['j'], 'Next row in a list'],
  [['k'], 'Previous row in a list'],
  [['Enter'], 'Open or toggle the focused row'],
  [['[', ']'], 'Previous or next view (Overview, Workouts)'],
  [['r'], 'Refresh this tab'],
  [['?'], 'Show these shortcuts'],
  [['Esc'], 'Close the palette, a sheet or this overlay'],
];

const keyFor: Record<string, string> = { t: 'today', p: 'projects', s: 'systems', b: 'budget', h: 'health', q: 'query' };

function setBeta(on: boolean) {
  document.cookie = `hd-beta=${on ? 1 : 0}; path=/; max-age=31536000; samesite=lax`;
}

export function Shell({ items, beta, phoneTabs, children }: { items: NavItem[]; beta: boolean; phoneTabs: string[]; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const current = items.find((i) => pathname.startsWith(i.href)) ?? items[0];
  const [sheet, setSheet] = useState(false);
  const [palette, setPalette] = useState(false);
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const pendingG = useRef(0);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!current?.refreshSeconds) return;
    const id = setInterval(() => { if (document.visibilityState === 'visible') router.refresh(); }, current.refreshSeconds * 1000);
    return () => clearInterval(id);
  }, [current?.refreshSeconds, router]);

  const [help, setHelp] = useState(false);

  useEffect(() => {
    const go = (k: number) => { const item = items[(k + items.length) % items.length]; if (item) router.push(item.href); };
    const curIdx = () => Math.max(0, items.findIndex((i) => pathname.startsWith(i.href)));
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      const typing = t.isContentEditable || /^(TEXTAREA|SELECT)$/.test(t.tagName) || (t.tagName === 'INPUT' && !/^(checkbox|radio|button|submit)$/.test((t as HTMLInputElement).type));
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setHelp(false); setPalette((p) => !p); return; }
      if ((e.metaKey || e.ctrlKey) && /^[1-9]$/.test(e.key)) {
        const item = items[Number(e.key) - 1];
        if (item) { e.preventDefault(); router.push(item.href); }
        return;
      }
      if (e.key === 'Escape' && help) { e.preventDefault(); setHelp(false); return; }
      // Query autofocuses its one-line search box; let Opt+Up/Down still switch tabs from there.
      const tabArrows = e.altKey && !e.metaKey && !e.ctrlKey && !e.shiftKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown');
      if (tabArrows && (!typing || t.hasAttribute('data-search'))) { e.preventDefault(); go(curIdx() + (e.key === 'ArrowUp' ? -1 : 1)); return; }
      if (e.key === 'Escape' && typing && t.hasAttribute('data-search')) { t.blur(); return; }
      if (typing || e.metaKey || e.ctrlKey) return;
      if (e.altKey) return;
      if (e.key === '?') { e.preventDefault(); setHelp((h) => !h); return; }
      if (e.key === '/') {
        e.preventDefault();
        const field = document.querySelector<HTMLElement>('#content [data-search], #q-in');
        if (field) field.focus(); else router.push('/t/query');
        return;
      }
      if (e.key === 'j' || e.key === 'k') { if (moveRow(e.key === 'j' ? 1 : -1)) e.preventDefault(); return; }
      if (e.key === '[' || e.key === ']') {
        const links = [...document.querySelectorAll<HTMLAnchorElement>('#content .subnav a')];
        const at = links.findIndex((a) => a.getAttribute('aria-current') === 'page');
        if (links.length > 1) { e.preventDefault(); links[(at + (e.key === ']' ? 1 : -1) + links.length) % links.length].click(); }
        return;
      }
      if (e.key === 'r' && !pendingG.current) { router.refresh(); return; }
      if (e.key === 'g') { pendingG.current = Date.now(); return; }
      if (Date.now() - pendingG.current < 1200 && keyFor[e.key]) {
        const item = items.find((i) => i.id === keyFor[e.key]);
        pendingG.current = 0;
        if (item) router.push(item.href);
        return;
      }
      pendingG.current = 0;
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [items, pathname, router, help]);

  const toggleBeta = (on: boolean) => { setBeta(on); router.refresh(); };
  // Phone bar: configured tabs (homeConfig.phoneTabs) that are visible, then "More" for the rest.
  const barItems = phoneTabs.map((id) => items.find((i) => i.id === id)).filter((i): i is NavItem => !!i).slice(0, 4);
  const moreItems = items.filter((i) => !barItems.includes(i));
  const moreOn = !!current && moreItems.includes(current);

  return (
    <MotionConfig reducedMotion="user">
      <div className="hd">
        <a className="hd-skip" href="#content">Skip to content</a>
        <aside className="hd-rail">
          <div className="hd-brand">Home</div>
          <nav aria-label="Home" className="hd-nav">
            {items.map((i) => {
              const on = i.id === current?.id;
              return (
                <Link key={i.id} href={i.href} prefetch aria-current={on ? 'page' : undefined} title={i.title}>
                  {on ? <motion.span layoutId="hd-rail-ind" className="hd-ind" transition={{ type: 'spring', stiffness: 420, damping: 36 }} /> : null}
                  {i.icon}
                  <span className="hd-label">{i.title}</span>
                  {i.beta ? <span className="hd-beta">Beta</span> : null}
                  {i.badge ? <span className={`hd-badge ${i.badge.tone}`} aria-label={`${i.badge.count} need attention`}>{i.badge.count}</span> : null}
                </Link>
              );
            })}
          </nav>
          <div className="hd-rail-foot">
            <span>Mac mini, tailnet only</span>
            <button className="hd-linkish" onClick={() => setPalette(true)}><kbd>⌘K</kbd> to jump or search</button>
            <button className="hd-linkish" onClick={() => setHelp(true)}><kbd>?</kbd> shortcuts</button>
            <label className="hd-theme">Theme
              <select value={mounted ? theme : 'system'} onChange={(e) => setTheme(e.target.value)}>
                <option value="system">System</option><option value="dark">Dark</option><option value="light">Light</option>
              </select>
            </label>
          </div>
        </aside>

        <div id="content" className="hd-content" tabIndex={-1}>
          <motion.div key={pathname} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}>
            {children}
          </motion.div>
        </div>

        <nav className="hd-tabbar" aria-label="Tabs">
          {barItems.map((i) => {
            const on = i.id === current?.id;
            return (
              <Link key={i.id} href={i.href} aria-current={on ? 'page' : undefined}
                onClick={(e) => { if (on) { e.preventDefault(); setSheet(true); } }}>
                {on && !sheet ? <motion.span layoutId="hd-bar-ind" className="hd-bar-ind" transition={{ type: 'spring', stiffness: 420, damping: 36 }} /> : null}
                {i.icon}
                <span>{i.title}</span>
                {i.badge ? <span className={`hd-pip ${i.badge.tone}`} aria-label="needs attention" /> : null}
              </Link>
            );
          })}
          {moreItems.length ? (
            <button type="button" className="hd-more" aria-expanded={sheet} aria-haspopup="dialog" aria-current={moreOn ? 'page' : undefined} onClick={() => setSheet((v) => !v)}>
              {moreOn || sheet ? <motion.span layoutId="hd-bar-ind" className="hd-bar-ind" transition={{ type: 'spring', stiffness: 420, damping: 36 }} /> : null}
              <LayoutGrid aria-hidden className="hd-i" />
              <span>More</span>
              {moreItems.some((i) => i.badge) ? <span className="hd-pip" aria-label="needs attention" /> : null}
            </button>
          ) : null}
        </nav>

        {sheet ? <div className="hd-scrim hd-sheet-scrim" aria-hidden onClick={() => setSheet(false)} /> : null}
        <Drawer.Root open={sheet} onOpenChange={setSheet} modal={false} noBodyStyles>
          <Drawer.Portal>
            <Drawer.Content className="hd-sheet hd" aria-describedby={undefined}>
              <div className="hd-grab" />
              <Drawer.Title className="hd-sheet-title">Jump to</Drawer.Title>
              <ul className="hd-jump">
                {items.map((i) => (
                  <li key={i.id}>
                    <Link href={i.href} onClick={() => setSheet(false)} aria-current={i.id === current?.id ? 'page' : undefined}>
                      {i.icon}<span>{i.title}</span><small>{i.summary}</small>
                    </Link>
                  </li>
                ))}
              </ul>
              <div className="hd-sheet-row"><FlaskConical className="hd-i" aria-hidden /> Beta tabs
                <div className="hd-seg" role="group" aria-label="Beta tabs">
                  <button aria-pressed={!beta} onClick={() => toggleBeta(false)}>Off</button>
                  <button aria-pressed={beta} onClick={() => toggleBeta(true)}>On</button>
                </div>
              </div>
              <div className="hd-sheet-row"><Moon className="hd-i" aria-hidden /> Theme
                <div className="hd-seg" role="group" aria-label="Theme">
                  {['system', 'dark', 'light'].map((t) => <button key={t} aria-pressed={mounted && theme === t} onClick={() => setTheme(t)}>{t[0].toUpperCase() + t.slice(1)}</button>)}
                </div>
              </div>
            </Drawer.Content>
          </Drawer.Portal>
        </Drawer.Root>

        <Command.Dialog open={palette} onOpenChange={setPalette} label="Jump or search" className="hd-palette hd" overlayClassName="hd-scrim">
          <PaletteBody items={items} beta={beta} close={() => setPalette(false)} go={(href) => { setPalette(false); router.push(href); }}
            setTheme={setTheme} toggleBeta={toggleBeta} showHelp={() => { setPalette(false); setHelp(true); }} />
        </Command.Dialog>

        {help ? (
          <div className="hd-scrim hd-help-scrim" onClick={() => setHelp(false)}>
            <div className="hd-help hd" role="dialog" aria-modal="true" aria-labelledby="hd-help-t" onClick={(e) => e.stopPropagation()}>
              <div className="hd-ph"><h2 id="hd-help-t">Keyboard shortcuts</h2><button className="hd-btn ghost small" onClick={() => setHelp(false)} autoFocus>Close <kbd>Esc</kbd></button></div>
              <dl>
                {SHORTCUTS.map(([keys, what]) => <div key={what}><dt>{keys.map((k) => <kbd key={k}>{k}</kbd>)}</dt><dd>{what}</dd></div>)}
              </dl>
              <p className="hd-faint">Single-key shortcuts pause while you type in a field.</p>
            </div>
          </div>
        ) : null}
      </div>
    </MotionConfig>
  );
}

function PaletteBody({ items, beta, go, close, setTheme, toggleBeta, showHelp }: { items: NavItem[]; beta: boolean; go: (h: string) => void; close: () => void; setTheme: (t: string) => void; toggleBeta: (on: boolean) => void; showHelp: () => void }) {
  const [q, setQ] = useState('');
  return (
    <>
      <div className="hd-palette-in"><Search className="hd-i" aria-hidden /><Command.Input value={q} onValueChange={setQ} placeholder="Jump to a tab or search notes" autoFocus /><Dictate value={q} onChange={setQ} label="Say a tab or search" /></div>
      <Command.List>
        <Command.Empty>No match. Press Enter to search notes.</Command.Empty>
        <Command.Group heading="Tabs">
          {items.map((i, n) => (
            <Command.Item key={i.id} value={`${i.title} ${i.summary}`} onSelect={() => go(i.href)}>
              {i.icon}<span>{i.title}</span><small>{i.summary}</small>{n < 9 ? <kbd className="hd-pk">⌘{n + 1}</kbd> : null}
            </Command.Item>
          ))}
        </Command.Group>
        {q.trim() ? (
          <Command.Group heading="Notes">
            <Command.Item value={`search notes ${q}`} onSelect={() => go(`/t/query?q=${encodeURIComponent(q.trim())}`)}>
              <Search className="hd-i" aria-hidden /><span>Search notes for “{q.trim()}”</span>
            </Command.Item>
          </Command.Group>
        ) : null}
        <Command.Group heading="Settings">
          <Command.Item onSelect={() => { setTheme('dark'); close(); }}>Theme: Dark</Command.Item>
          <Command.Item onSelect={() => { setTheme('light'); close(); }}>Theme: Light</Command.Item>
          <Command.Item onSelect={() => { setTheme('system'); close(); }}>Theme: System</Command.Item>
          <Command.Item onSelect={() => { toggleBeta(!beta); close(); }}>{beta ? 'Hide beta tabs' : 'Show beta tabs'}</Command.Item>
        </Command.Group>
        <Command.Group heading="Keyboard shortcuts">
          <Command.Item value="keyboard shortcuts help" onSelect={showHelp}><Keyboard className="hd-i" aria-hidden /><span>Show all shortcuts</span><kbd className="hd-pk">?</kbd></Command.Item>
          {SHORTCUTS.filter(([k]) => k[0] !== '?').map(([keys, what]) => (
            <Command.Item key={what} value={`shortcut ${what} ${keys.join(' ')}`} onSelect={showHelp}>
              <span>{what}</span><kbd className="hd-pk">{keys.join(' ')}</kbd>
            </Command.Item>
          ))}
        </Command.Group>
      </Command.List>
    </>
  );
}
