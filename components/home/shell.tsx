'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion, MotionConfig } from 'motion/react';
import { Drawer } from 'vaul';
import { Command } from 'cmdk';
import { useTheme } from 'next-themes';
import { Search, Moon, FlaskConical, LayoutGrid } from 'lucide-react';
import type { Attention } from '@/app/tabs/types';

export type NavItem = { id: string; title: string; href: string; icon: ReactNode; beta: boolean; badge: Attention | null; summary: string; refreshSeconds: number };

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

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      const typing = t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette((p) => !p); return; }
      if ((e.metaKey || e.ctrlKey) && /^[1-9]$/.test(e.key)) {
        const item = items[Number(e.key) - 1];
        if (item) { e.preventDefault(); router.push(item.href); }
        return;
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === '/' && !pathname.startsWith('/t/query')) { e.preventDefault(); router.push('/t/query'); return; }
      if (e.key === 'g') { pendingG.current = Date.now(); return; }
      if (Date.now() - pendingG.current < 1200 && keyFor[e.key]) {
        const item = items.find((i) => i.id === keyFor[e.key]);
        pendingG.current = 0;
        if (item) router.push(item.href);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [items, pathname, router]);

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
            setTheme={setTheme} toggleBeta={toggleBeta} />
        </Command.Dialog>
      </div>
    </MotionConfig>
  );
}

function PaletteBody({ items, beta, go, close, setTheme, toggleBeta }: { items: NavItem[]; beta: boolean; go: (h: string) => void; close: () => void; setTheme: (t: string) => void; toggleBeta: (on: boolean) => void }) {
  const [q, setQ] = useState('');
  return (
    <>
      <div className="hd-palette-in"><Search className="hd-i" aria-hidden /><Command.Input value={q} onValueChange={setQ} placeholder="Jump to a tab or search notes" autoFocus /></div>
      <Command.List>
        <Command.Empty>No match. Press Enter to search notes.</Command.Empty>
        <Command.Group heading="Tabs">
          {items.map((i) => (
            <Command.Item key={i.id} value={`${i.title} ${i.summary}`} onSelect={() => go(i.href)}>
              {i.icon}<span>{i.title}</span><small>{i.summary}</small>
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
      </Command.List>
    </>
  );
}
