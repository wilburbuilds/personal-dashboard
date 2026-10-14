# Home

A private, self-hosted personal dashboard that runs on a Mac mini and is reachable only over a Tailscale tailnet. One fast, keyboard-friendly app pulls together the day, tasks, home-server health, budget, health and workouts, and full-text search across Obsidian vaults.

> All screenshots below use **demo mode** (`npm run demo`): every name, number, note and transaction is synthetic.

![Today](docs/screenshots/today.png)

## Tabs

| Tab | What it shows | Source |
|---|---|---|
| **Today** | A timeline of the day with a "now" rule and tonight's workout slotted in, replies worth sending, body metrics, markets and headlines | Google Calendar + Gmail (read-only), Open-Meteo, RSS / curated brief, Yahoo quotes, Fitbit exports |
| **Projects** | Read-only kanban board | Vikunja API (GET only) |
| **Systems** | Up/degraded/down for every home service, with a 24-hour history | Services table in a vault note, local probes, optional health feed JSON |
| **Budget** | Pace vs. target, category trends, upcoming bills, card interest, and a short "what to do" list | Actual Budget via `@actual-app/api`, cached by a read-only sync job |
| **Health** | Overview (sleep stages, overnight signals, activity, two-week trends) and Workouts (week strip, today's sets checklist, training log, records, a "Tell Gym" box) | Fitbit raw exports + training notes in the vault |
| **Query** | SQLite FTS5 search across vaults, with rendered markdown (wikilinks, callouts, embeds) | Obsidian vaults on disk |

| | |
|---|---|
| ![Budget](docs/screenshots/budget.png) | ![Health](docs/screenshots/health.png) |
| ![Workouts](docs/screenshots/workouts.png) | ![Systems](docs/screenshots/systems.png) |
| ![Projects](docs/screenshots/projects.png) | ![Query](docs/screenshots/query.png) |
| ![Command palette](docs/screenshots/palette.png) | <img src="docs/screenshots/phone-budget.png" width="260" alt="Budget on a phone"> |

### Keyboard

`⌘K` palette · `⌥↑`/`⌥↓` previous/next tab · `⌘1–9` tab by position · `g` then `t h b s p q` · `/` search · `j`/`k` rows · `[`/`]` sub-views · `r` refresh · `?` all shortcuts · `Esc` close. Every text field has a mic button for dictation (the browser's built-in Web Speech API).

## Architecture

- **Next.js 16 / React 19 / TypeScript**, server-rendered. `scripts/start.mjs` binds to `127.0.0.1` only and rejects unknown `Host`/`Origin` headers and cross-site writes.
- **Tailscale Serve** gives tailnet-only HTTPS on its own port. Funnel is never used, and there is no public login; the tailnet is the boundary.
- **launchd** keeps the server running (`npm run service:install`) plus two helper jobs: Budget sync (every 30 min) and overnight-mail curation.
- **Private data stays outside Git**: runtime SQLite, caches and logs live in `~/Library/Application Support/Personal Dashboard/` and `~/.local/share/home-dashboard/`. Secrets go in a mode-600 env file (below).
- **Writes are deliberately narrow.** Everything is read-only except two vault writes: (1) flipping `- [ ]`↔`- [x]` on an existing set line in `fitness/workouts/YYYY-MM-DD.md`, matched by line hash with a per-file lock and an atomic rename, and (2) appending to `fitness/gym-inbox.md`. Vikunja and Actual are read-only.

```
app/
  t/[tab]/page.tsx        one route renders any tab
  tabs/registry.ts        list of tab plugins
  tabs/<id>/plugin.tsx    data loader + metadata
  tabs/<id>/view.tsx      UI
  api/…                   dashboard, query, budget sync, workout check, gym
components/home/          shell (rail, tab bar, palette, shortcuts), markdown, mic
lib/                      source adapters (calendar, gmail, health, workouts, budget, systems, query, demo fixtures)
lib/home-config.mjs       every design/behaviour switch in one place
scripts/                  start, service installers, budget sync, demo
tests/                    node:test suites (synthetic data only)
```

### Tab plugin contract

Every tab is a `TabPlugin<D>` (`app/tabs/types.ts`):

```ts
interface TabPlugin<D> {
  id: TabId; title: string; icon: LucideIcon; order: number;
  status: 'live' | 'beta' | 'hidden';          // beta tabs show with ?beta=1
  refreshSeconds: number;                      // 0 = no auto refresh
  load(ctx: { now: Date; signal: AbortSignal; params: URLSearchParams }): Promise<SourceResult<D>>;
  View: FC<{ data: D; fetchedAt: Date }>;
  attention?(data: D): { count: number; tone: 'warn' | 'over' } | null;   // rail badge
  summary?(data: D): string;                                            // palette / jump sheet line
  Skeleton?: FC;
}
```

`load` runs on the server once per request (shared by the nav badges and the page), is timed and logged, and returns `ok(data)` or `fail(error, stale?)`. To add a tab, create `app/tabs/<id>/plugin.tsx` and `view.tsx`, then add it to `registry.ts`.

## Setup

Requires macOS, Node 22.13+ and Tailscale.

```sh
npm ci
npm run build
npm start                         # http://127.0.0.1:3000
npm run service:install           # LaunchAgent: start at login, restart on crash
tailscale serve --bg --https=9443 http://127.0.0.1:3000
```

Set `DASHBOARD_ORIGIN` to the tailnet HTTPS origin (for example `https://<machine>.<tailnet>.ts.net:9443`) when installing the service. Optional jobs: `npm run service:install-budget-sync`, `npm run service:install-overnight-curate`. Google OAuth: `npm run oauth:google` (see [GOOGLE.md](GOOGLE.md)).

**Demo mode:** `npm run build && npm run demo` serves synthetic data for every tab at http://127.0.0.1:3200, using a throwaway data directory and no personal sources.

Checks: `npm run typecheck`, `npm run test:unit`.

### Environment variables (names only; never commit values)

Secrets file `~/.config/home-dashboard/env` (mode 600): `VIKUNJA_URL`, `VIKUNJA_API_TOKEN`, `GYM_WEBHOOK_URL`, `GYM_WEBHOOK_SECRET`.

Process env: `DASHBOARD_ORIGIN`, `PORT`, `DASHBOARD_DATA_DIR`, `DASHBOARD_PERSONAL_VAULT`, `DASHBOARD_MORNING_HTML`, `DASHBOARD_GOOGLE_CONFIG_DIR`, `DASHBOARD_GOOGLE_OAUTH`, `DASHBOARD_GOOGLE_TOKENS`, `ACTUAL_SERVER_PASSWORD` (or the macOS keychain), `GROK_BIN`, `HOMEKIT_BIND_ADDRESS`, `HOMEKIT_RECEIVER_URL`, `HD_DATA_DIR`, `HD_ENV_FILE`, `HD_LOAD_LOG`, `HD_SERVICES_FILE`, `HD_HEALTH_FEED`, `HD_QUERY_VAULTS`, `HD_DEMO`, `HD_DEMO_DIR`.

## Hosting and privacy

- Tailnet only. The server listens on loopback and Tailscale Serve terminates HTTPS. Do not enable Funnel or port-forward it.
- No health exports, messages, budget data, vault content, tokens or databases belong in this repository. `.gitignore` covers env files, SQLite/DB files, logs and local caches.
- More detail on each data source and on operations: [docs/SOURCES.md](docs/SOURCES.md), [UPDATE.md](UPDATE.md), [HANDOFF.md](HANDOFF.md).
