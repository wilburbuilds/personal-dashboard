import { SquareKanban } from 'lucide-react';
import type { TabPlugin } from '../types';
import { ok } from '../types';
import { loadBoard, type Board } from '@/lib/sources/vikunja';
import { homeConfig } from '@/lib/home-config.mjs';
import ProjectsView from './view';

const projects: TabPlugin<Board> = {
  id: 'projects', title: 'Projects', icon: SquareKanban, order: 2, status: 'live', refreshSeconds: 120,
  async load({ params, signal }) {
    const id = Number(params.get('p')) || homeConfig.vikunja.defaultProject;
    return ok(await loadBoard(id, signal));
  },
  View: ProjectsView,
};
export default projects;
