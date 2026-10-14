import { SquareKanban } from 'lucide-react';
import type { TabPlugin } from '../types';
import { ok } from '../types';
import { loadBoard, type Board } from '@/lib/sources/vikunja';
import { readTodos, type Todos } from '@/lib/sources/todos';
import { homeConfig } from '@/lib/home-config.mjs';
import ProjectsView from './view';

const projects: TabPlugin<Board & { todos: Todos }> = {
  id: 'projects', title: 'Projects', icon: SquareKanban, order: 2, status: 'live', refreshSeconds: 120,
  async load({ params, signal }) {
    const id = Number(params.get('p')) || homeConfig.vikunja.defaultProject;
    const [board, todos] = await Promise.all([loadBoard(id, signal), readTodos()]);
    return ok({ ...board, todos });
  },
  View: ProjectsView,
  settings: {
    title: 'To-dos',
    description: 'The read-only to-do list on Projects and “Due today” on Today.',
    fields: [
      { key: 'todos.excludeLists', label: 'Hide Reminders lists', help: 'List names to leave out, e.g. a work list.', type: 'tags' },
      { key: 'todos.vikunja', label: 'Include Vikunja tasks', type: 'toggle' },
    ],
  },
};
export default projects;
