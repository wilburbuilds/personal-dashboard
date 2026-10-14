import { Shell, type NavItem } from '@/components/home/shell';
import { visibleTabs, loadTab } from '@/app/tabs/registry';
import { getSettings } from '@/lib/settings.mjs';

export const dynamic = 'force-dynamic';

export default async function TabsLayout({ children }: { children: React.ReactNode }) {
  const s = getSettings();
  const items: NavItem[] = await Promise.all(visibleTabs().map(async (p) => {
    let badge = null;
    let summary = '';
    if (p.attention || p.summary) {
      const r = await loadTab(p.id, '');
      if (r.ok) {
        badge = p.attention?.(r.data) ?? null;
        summary = p.summary?.(r.data) ?? '';
      } else summary = 'Needs attention';
    }
    const Icon = p.icon;
    return { id: p.id, title: p.title, href: `/t/${p.id}`, icon: <Icon aria-hidden className="hd-i" />, badge, summary, refreshSeconds: p.refreshSeconds };
  }));
  const phoneTabs = s.pages.order.filter((id) => !s.pages.hidden.includes(id)).slice(0, 4);
  return <Shell items={items} phoneTabs={phoneTabs} theme={s.theme}>{children}</Shell>;
}
