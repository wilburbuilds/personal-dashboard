import { homedir } from 'node:os';
import { join } from 'node:path';

const home = process.env.HOME || homedir();

/** Every open design question from the HD-0 spec lives here as one switch. */
export const homeConfig = {
  theme: 'system',
  webFonts: true,
  /** Today is the v2 blank-slate layout (timeline + what needs you); the legacy glass layout was removed. */
  todayStyle: 'v2',
  today: {
    /** Lead sentence: 'rules' composes it from the data (no AI). 'curation' would use the overnight curation model (not wired yet). */
    lead: 'rules',
    workoutDefaultTime: '7:40 PM',
  },
  /** Phone tab bar: up to 4 tab ids, then "More" opens the Jump sheet with the rest. */
  phoneTabs: ['today', 'health', 'budget', 'systems'],
  health: {
    vault: process.env.DASHBOARD_PERSONAL_VAULT || join(home, 'vaults/personal'),
    /** Rail attention badge for Health: false, or 'stale' (no log in 7 days or Fitbit sync older than 36 h). */
    badge: false,
    /** Skin temperature delta units: 'C' or 'F'. */
    tempUnit: 'C',
    /** Training log status: 'auto' uses a Status column when Gym adds one, else guesses from free text. 'text' always guesses. */
    logStatus: 'auto',
    staleLogDays: 7,
    trendDays: 14,
  },
  markdown: {
    /** Task-list checkboxes in rendered notes: 'readonly'. (The only vault writes are the Workouts set checklist, fitness/workouts/<day>.md, and fitness/gym-inbox.md.) */
    checkboxes: 'readonly',
    /** Dataview / dataviewjs blocks: 'code' shows them as plain code blocks. 'hide' drops them. */
    dataview: 'code',
  },
  dataDir: process.env.HD_DATA_DIR || join(home, '.local/share/home-dashboard'),
  envFile: process.env.HD_ENV_FILE || join(home, '.config/home-dashboard/env'),
  loadLog: process.env.HD_LOAD_LOG || join(home, 'Library/Logs/home-dashboard.jsonl'),
  actual: {
    serverURL: 'http://127.0.0.1:5006',
    publicURL: 'https://machine.tailnet.ts.net:5443',
    syncId: '',
    keychainService: 'home-dashboard-actual',
    keychainAccount: 'me',
    syncEverySeconds: 1800,
  },
  budget: {
    incomeCategories: ['Paycheck', 'Other income', 'Interest', 'Income', 'Starting Balances'],
    fixedCategories: ['Housing', 'Insurance', 'Utilities', 'Phone', 'Subscriptions'],
    debtCostCategories: ['Interest & fees'],
    overThreshold: 0.08,
    billWindowDays: 10,
    staleAfterDays: 3,
    suggestMoves: true,
    maxActions: 3,
  },
  vikunja: {
    publicURL: 'http://machine.tailnet.ts.net:3456',
    defaultProject: 8,
  },
  systems: {
    servicesFile: process.env.HD_SERVICES_FILE || join(home, 'vaults/personal/home/services.md'),
    healthFeed: process.env.HD_HEALTH_FEED || join(home, '.local/share/service-manager/health.json'),
    feedStaleMinutes: 30,
  },
  query: {
    /** HD_QUERY_VAULTS (JSON array of {id,label,path}) overrides this, e.g. for demo mode. */
    vaults: /** @type {{ id: string; label: string; path: string }[]} */ (process.env.HD_QUERY_VAULTS ? JSON.parse(process.env.HD_QUERY_VAULTS) : [
      { id: 'personal', label: 'personal', path: join(home, 'vaults/personal') },
      { id: 'work', label: 'work', path: join(home, 'vaults/work') },
    ]),
  },
};
