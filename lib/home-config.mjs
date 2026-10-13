import { homedir } from 'node:os';
import { join } from 'node:path';

const home = process.env.HOME || homedir();

/** Every open design question from the HD-0 spec lives here as one switch. */
export const homeConfig = {
  theme: 'system',
  webFonts: true,
  todayStyle: 'legacy',
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
    vaults: [
      { id: 'personal', label: 'personal', path: join(home, 'vaults/personal') },
      { id: 'work', label: 'work', path: join(home, 'vaults/work') },
    ],
  },
};
