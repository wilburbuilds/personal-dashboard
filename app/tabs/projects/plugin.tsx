import { SquareKanban } from 'lucide-react';
import type { TabPlugin } from '../types';
import { ok } from '../types';
import { loadOverview, type Overview } from '@/lib/sources/vikunja-projects';
import { readTodos, type Todos } from '@/lib/sources/todos';
import ProjectsView from './view';

const projects: TabPlugin<Overview & { todos: Todos }> = {
  id: 'projects', title: 'Projects', icon: SquareKanban, order: 2, status: 'live', refreshSeconds: 120,
  async load({ signal }) {
    const [overview, todos] = await Promise.all([loadOverview(signal), readTodos()]);
    return ok({ ...overview, todos });
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
