import { notFound } from 'next/navigation';
import { findTab, loadTab, visibleTabs } from '@/app/tabs/registry';
import { PanelError } from '@/components/home/ui';

export const dynamic = 'force-dynamic';

export default async function TabPage({ params, searchParams }: { params: Promise<{ tab: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { tab } = await params;
  const plugin = findTab(tab);
  if (!plugin || !visibleTabs().includes(plugin)) notFound();
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) if (typeof v === 'string' && k !== 'beta') sp.set(k, v);
  const result = await loadTab(plugin.id, sp.toString());
  const View = plugin.View;
  if (result.ok) return <View data={result.data} fetchedAt={result.fetchedAt} />;
  return (
    <div className="hd-page">
      <header className="hd-top"><h1>{plugin.title}</h1></header>
      <PanelError title={`Couldn't load ${plugin.title}`} detail={result.error} />
      {result.stale ? <div className="hd-dim" aria-hidden><View data={result.stale} fetchedAt={new Date()} /></div> : null}
    </div>
  );
}
