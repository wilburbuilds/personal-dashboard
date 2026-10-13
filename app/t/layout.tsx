import { cookies } from 'next/headers';
import { Shell, type NavItem } from '@/components/home/shell';
import { visibleTabs, loadTab } from '@/app/tabs/registry';

export const dynamic = 'force-dynamic';

export default async function TabsLayout({ children }: { children: React.ReactNode }) {
  const beta = (await cookies()).get('hd-beta')?.value === '1';
  const items: NavItem[] = await Promise.all(visibleTabs(beta).map(async (p) => {
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
    return { id: p.id, title: p.title, href: `/t/${p.id}`, icon: <Icon aria-hidden className="hd-i" />, beta: p.status === 'beta', badge, summary, refreshSeconds: p.refreshSeconds };
  }));
  return <Shell items={items} beta={beta}>{children}</Shell>;
}
