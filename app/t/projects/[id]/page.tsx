import { notFound } from 'next/navigation';
import { findTab, visibleTabs } from '@/app/tabs/registry';
import { loadProjectBoard } from '@/lib/sources/vikunja-projects';
import { PanelError } from '@/components/home/ui';
import ProjectBoardView from './board';

export const dynamic = 'force-dynamic';

export default async function ProjectBoardPage({ params }: { params: Promise<{ id: string }> }) {
  const plugin = findTab('projects');
  if (!plugin || !visibleTabs().includes(plugin)) notFound();
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const r = await loadProjectBoard(id, AbortSignal.timeout(10000)).then((board) => ({ board, error: '' }), (e) => ({ board: null, error: e instanceof Error ? e.message : 'Vikunja didn’t answer.' }));
  if (r.board) return <ProjectBoardView board={r.board} fetchedAt={new Date().toISOString()} />;
  return (
    <div className="hd-page">
      <header className="hd-top"><h1>Project</h1></header>
      <PanelError title="Couldn’t load this board" detail={r.error} />
    </div>
  );
}
