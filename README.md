# Home

A self-hosted personal dashboard built to run on an always-on Mac and to be reachable only over your Tailscale tailnet. One fast, keyboard-friendly app pulls together the day, tasks, home-server health, budget, health and workouts, and full-text search across Obsidian vaults.

> All screenshots below use **demo mode** (`npm run demo`): every name, number, note and transaction is synthetic.

![Today](docs/screenshots/today.png)

## Tabs

| Tab | What it shows | Source |
|---|---|---|
| **Today** | A timeline of the day with a "now" rule and tonight's workout slotted in, replies worth sending, body metrics, markets and headlines | Google Calendar + Gmail (read-only), Open-Meteo, RSS / curated brief, Yahoo quotes, Fitbit exports |
| **Projects** | Read-only kanban board | Vikunja API (GET only) |
| **Systems** | Up/degraded/down for every home service, with a 24-hour history | Services table in a vault note, local probes, optional health feed JSON |
| **Budget** | Pace vs. target, category trends, upcoming bills, card interest, and a short "what to do" list | Actual Budget via `@actual-app/api`, cached by a read-only sync job |
| **Health** | Overview (sleep stages, overnight signals, activity, two-week trends) and Workouts (week strip, today's sets checklist, training log, records, a "Tell Gym" box for a coaching agent) | Fitbit raw exports + training notes in the vault |
| **Query** | SQLite FTS5 search across vaults, with rendered markdown (wikilinks, callouts, embeds) | Obsidian vaults on disk |

| | |
|---|---|
| ![Budget](docs/screenshots/budget.png) | ![Health](docs/screenshots/health.png) |
| ![Workouts](docs/screenshots/workouts.png) | ![Systems](docs/screenshots/systems.png) |
| ![Projects](docs/screenshots/projects.png) | ![Query](docs/screenshots/query.png) |
| ![Command palette](docs/screenshots/palette.png) | ![Settings](docs/screenshots/settings.png) |
| <img src="docs/screenshots/phone-budget.png" width="260" alt="Budget on a phone"> | |

### Settings

The gear at the bottom of the rail (or **More → Settings** on a phone, or `⇧S`) opens `/t/settings`:

- **Pages:** show, hide and reorder tabs (drag or arrow buttons). The order drives the rail, the phone bar (first four visible), `⌘1–9` and `⌥↑`/`⌥↓`. Today can't be hidden and at least one tab always stays visible.
- **Appearance:** theme (System / Dark / Light, applied server-side so every device matches) and web fonts.
- **Per-tab knobs**, declared by each plugin's optional `settings` schema: Today's headline sentence, weather city and topics; Budget's over-pace threshold, bill categories and reminder window; Health's temperature unit, nav badge and training-log status; which vaults Query searches; how notes render task checkboxes and Dataview blocks.

Changes autosave to `~/.config/home-dashboard/settings.json` (mode 600, outside the repo, override with `HD_SETTINGS_FILE`). The file is validated with zod and layered over `lib/home-config.mjs`; an invalid file falls back to the defaults. Each section has its own Reset.

### Keyboard

`⌘K` palette · `⌥↑`/`⌥↓` previous/next tab · `⌘1–9` tab by position · `t p s b h q` jump straight to Today, Projects, Systems, Budget, Health, Query (or `g` then the letter) · `⇧S` Settings · `/` search · `j`/`k` rows · `[`/`]` sub-views · `r` refresh · `?` all shortcuts · `Esc` close. Every text field has a mic button for dictation (the browser's built-in Web Speech API).

## Architecture

- **Next.js 16 / React 19 / TypeScript**, server-rendered. `scripts/start.mjs` binds to `127.0.0.1` only and rejects unknown `Host`/`Origin` headers and cross-site writes.
- **Tailscale Serve** gives tailnet-only HTTPS on its own port. Funnel is never used, and there is no public login; the tailnet is the boundary.
- **launchd** keeps the server running (`npm run service:install`) plus two helper jobs: Budget sync (every 30 min) and overnight-mail curation.
- **Private data stays outside Git**: runtime SQLite, caches and logs live in the OS app-data directory and `~/.local/share/home-dashboard/`. Secrets go in a mode-600 env file (below).
- **Writes are deliberately narrow.** Vault content is read-only except two writes: (1) flipping `- [ ]`↔`- [x]` on an existing set line in `fitness/workouts/YYYY-MM-DD.md`, matched by line hash with a per-file lock and an atomic rename, and (2) appending to `fitness/gym-inbox.md`. Vikunja and Actual are read-only.

```
app/
  t/[tab]/page.tsx        one route renders any tab
  tabs/registry.ts        list of tab plugins
  tabs/<id>/plugin.tsx    data loader + metadata
  tabs/<id>/view.tsx      UI
  api/…                   dashboard, query, settings, budget sync, workout check, gym
  t/settings/             Settings view (pages, appearance, per-tab knobs)
components/home/          shell (rail, tab bar, palette, shortcuts), markdown, mic
lib/                      source adapters (calendar, gmail, health, workouts, budget, systems, query, demo fixtures)
lib/home-config.mjs       every design/behaviour switch in one place
lib/settings.mjs          user settings: schema, validation, persistence
public/                   favicon (SVG + ICO), apple-touch icon, PWA icons (manifest in app/manifest.ts)
scripts/                  start, service installers, budget sync, demo
tests/                    node:test suites (synthetic data only)
```

### Tab plugin contract

Every tab is a `TabPlugin<D>` (`app/tabs/types.ts`):

```ts
interface TabPlugin<D> {
  id: TabId; title: string; icon: LucideIcon; order: number;
  status: 'live' | 'hidden';
  settings?: SettingsSection | (() => SettingsSection);   // optional knobs shown in Settings
  refreshSeconds: number;                      // 0 = no auto refresh
  load(ctx: { now: Date; signal: AbortSignal; params: URLSearchParams }): Promise<SourceResult<D>>;
  View: FC<{ data: D; fetchedAt: Date }>;
  attention?(data: D): { count: number; tone: 'warn' | 'over' } | null;   // rail badge
  summary?(data: D): string;                                            // palette / jump sheet line
  Skeleton?: FC;
}
```

`load` runs on the server once per request (shared by the nav badges and the page), is timed and logged, and returns `ok(data)` or `fail(error, stale?)`. To add a tab, create `app/tabs/<id>/plugin.tsx` and `view.tsx`, then add it to `registry.ts`.

## Quick start (demo mode first)

Requires Node 22.13+ (macOS or Linux for the demo).

```sh
git clone https://github.com/wilburbuilds/home-dashboard.git
cd home-dashboard
npm ci
npm run build
npm run demo          # http://127.0.0.1:3200, synthetic data for every tab
```

Demo mode writes invented fixtures to a temporary directory (`HD_DEMO_DIR`, default `$TMPDIR/home-dashboard-demo`) and points every adapter there. Nothing personal is read and nothing leaves the machine. Checks: `npm run typecheck` and `npm run test:unit`.

## Running it for real

The real setup targets a Mac that is always on (a Mac mini works well) and is on your Tailscale tailnet.

1. **Config.** Open `lib/home-config.mjs`. Every design and behaviour switch lives there: theme, vault paths, budget thresholds, phone tab order, and so on. The defaults read vaults from `~/vaults/personal` and `~/vaults/work`.
2. **Secrets.** Create `~/.config/home-dashboard/env` with mode 600 (see the variables below). It is never sent to the browser.
3. **Build and run:** `npm ci && npm run build && npm start` serves http://127.0.0.1:3000 (loopback only).
4. **Keep it running:** `DASHBOARD_ORIGIN=https://<machine>.<tailnet>.ts.net:9443 npm run service:install` installs a LaunchAgent that starts at login and restarts on crash.
5. **Expose it to your tailnet only:** `tailscale serve --bg --https=9443 http://127.0.0.1:3000`. Never use Funnel.
6. **Optional sources:**
   - **Budget:** run Actual Budget locally, then set `ACTUAL_SYNC_ID` and the keychain item (or `ACTUAL_SERVER_PASSWORD`), then `npm run service:install-budget-sync`.
   - **Projects:** a Vikunja URL and an API token.
   - **Google Calendar and Gmail** (read-only): put an OAuth client in `~/.config/home-dashboard/google/oauth.json` (see `google-oauth.example.json`), then run `npm run oauth:google`.
   - **Health:** Fitbit JSON exports under `<vault>/fitness/fitbit-air/raw/YYYY-MM-DD.json`, `fitness/current-program.md`, `fitness/training-log.md`, and daily set notes at `fitness/workouts/YYYY-MM-DD.md` (one `- [ ] Exercise — set N — target` line per set).
   - **Systems:** a markdown table in `<vault>/home/services.md` with the columns `Service | What it is | Reach it at | Lifecycle`, plus probes in `lib/sources/systems.mjs`.

### Environment variables (names only)

Secrets file `~/.config/home-dashboard/env`: `VIKUNJA_URL`, `VIKUNJA_API_TOKEN`, `GYM_WEBHOOK_URL`, `GYM_WEBHOOK_SECRET` (optional webhook for the "Tell Gym" box).

Process env:
- **Server and paths:** `DASHBOARD_ORIGIN`, `PORT`, `DASHBOARD_DATA_DIR`, `DASHBOARD_PERSONAL_VAULT`, `DASHBOARD_MORNING_HTML`
- **Google:** `DASHBOARD_GOOGLE_CONFIG_DIR`, `DASHBOARD_GOOGLE_OAUTH`, `DASHBOARD_GOOGLE_TOKENS`, `GOOGLE_ACCOUNT_HINT`
- **Actual:** `ACTUAL_PUBLIC_URL`, `ACTUAL_SYNC_ID`, `ACTUAL_SERVER_PASSWORD`, `ACTUAL_KEYCHAIN_SERVICE`, `ACTUAL_KEYCHAIN_ACCOUNT`
- **Vikunja:** `VIKUNJA_PUBLIC_URL`, `VIKUNJA_DEFAULT_PROJECT`
- **Other integrations:** `GROK_BIN`, `HOMEKIT_BIND_ADDRESS`, `HOMEKIT_RECEIVER_URL`
- **App internals and demo:** `HD_DATA_DIR`, `HD_ENV_FILE`, `HD_LOAD_LOG`, `HD_SERVICES_FILE`, `HD_HEALTH_FEED`, `HD_QUERY_VAULTS`, `HD_SETTINGS_FILE`, `HD_DEMO`, `HD_DEMO_DIR`

## Hosting and privacy

- **Built for a tailnet, not the internet.** The server listens on 127.0.0.1, checks `Host` and `Origin`, and refuses cross-site writes. Tailscale Serve terminates HTTPS. There is no login system, so do not port-forward it or enable Funnel.
- **Personal data stays out of Git.** Health exports, messages, budget data, vault content, tokens and databases belong outside the repository. `.gitignore` covers env files, SQLite/DB files, logs and caches.
- **Writes are narrow.** The only vault writes are the two edits described under Architecture; Settings writes only its own `settings.json`.

## License

MIT. See [LICENSE](LICENSE).
