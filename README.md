# Today · Personal dashboard

Private personal dashboard for the owner, stored in `wilburbuilds/personal-dashboard`. Includes weather, health, calendar, overnight notifications, follow-ups, headlines, scheduled tasks, Discord, and Home Assistant sections. Data connections and daily scheduling are still pending.

## Run on the Mac mini

Install Node.js 22.13 or later and authenticate GitHub as **wilburbuilds**, then:

```sh
git clone https://github.com/wilburbuilds/personal-dashboard.git
cd personal-dashboard
npm ci
npm run build
npm start
```

Open http://127.0.0.1:3000 on the Mac mini. The server listens on loopback only, validates request hosts and origins, and sends no-store responses. It requires no Sites, Cloudflare, or work account.

For access from another computer, use an SSH tunnel to the Mac mini:

```sh
ssh -N -L 3000:127.0.0.1:3000 YOUR_MAC_USER@YOUR_MAC_MINI
```

Then open http://127.0.0.1:3000 on that computer. SSH access must already be configured. Do not expose or port-forward this dashboard publicly; it intentionally trusts the local Mac user and has no public login system.

## Start automatically

On the Mac mini, after a successful build:

```sh
npm run service:install
```

This installs a macOS LaunchAgent for the current user, starts the dashboard, and restarts it after a crash or at login. The user must be logged in, and the Mac must be awake. It is not a system daemon that starts before login. Re-run the installer if the checkout or Node binary moves.

```sh
npm run service:uninstall
```

Uninstalling the service preserves personal data.

## Data and backups

SQLite data lives outside the repository in `~/Library/Application Support/Personal Dashboard/dashboard.sqlite`. Logs are in the same directory. Set `DASHBOARD_DATA_DIR` to override the location for a manual start. No health readings, messages, credentials, or runtime database belongs in GitHub.

Back up the database using SQLite's backup feature, or stop the service before copying the data directory. Do not copy only the main SQLite file while writes are running: current data may also be in its WAL file. Updates preserve the database because it lives outside the checkout.

## Update from GitHub

```sh
git pull --ff-only
npm ci
npm run build
npm run service:install
```

Code changes are committed and pushed explicitly. There is no unattended code deployment or automatic push of local files. The Mac mini pulls the same private GitHub repository.

## Development

`npm run dev` starts the development server on loopback. `npm run typecheck` checks types. Production uses `npm run build` followed by `npm start`.

See [UPDATE.md](UPDATE.md) for the local daily-update API. The initial private Sites preview remains a separate older deployment; this repository no longer publishes to it.

## Private Tailscale access

For this installation the dashboard has its own Tailscale HTTPS listener on port 9443. Existing listeners remain unchanged. The Node server still binds only to 127.0.0.1:3000. Tailscale Serve grants access according to the tailnet's access rules; it is not a public Funnel.

On the Mac mini, install or update the service with its exact private origin:

```sh
DASHBOARD_ORIGIN=https://machine.tailnet.ts.net:9443 npm run service:install
/Applications/Tailscale.app/Contents/MacOS/Tailscale serve --bg --https=9443 http://127.0.0.1:3000
```

Open https://machine.tailnet.ts.net:9443 from a device connected to your Tailscale network. Preserve `DASHBOARD_ORIGIN` when reinstalling the startup service. Do not enable Tailscale Funnel for this dashboard.

The glass interface uses translucent layers, blur, subtle edge highlights, and a system font. It respects reduced motion and reduced transparency preferences, and has a solid-surface fallback for browsers without backdrop blur.

## HomePod receiver

The dashboard exposes a private setup page at `/homekit`. Its reveal button retrieves a copy-ready automation prompt with the real receiver address and a token; do not share that prompt or commit the token. The token is generated once and stored with permissions 0600 outside the repository in the dashboard data directory.

The separate intake server accepts only `POST /api/homekit` on port 3088, requires `Authorization: Bearer <token>`, limits requests to 16 KiB, and validates temperatures, humidity, room names, and observation times. It exposes no dashboard, settings, or read endpoint on the LAN. The dashboard stays localhost/Tailscale-only. LAN intake uses HTTP; the token is scoped only to submitting HomePod readings.

Install the service with `HOMEKIT_BIND_ADDRESS` set to the mini's LAN IPv4 address and `HOMEKIT_RECEIVER_URL` set to `http://localhost:3088/api/homekit`. The installer preserves existing port/origin/receiver settings on subsequent updates. If DHCP changes the mini's LAN address, update HOMEKIT_BIND_ADDRESS and reinstall the service; a router DHCP reservation avoids this.

Readings persist separately in `homekit.sqlite`, survive brief snapshot updates, and retain 30 days of history. Duplicate room/timestamp readings are ignored; older uploads never replace newer measurements. “At home” displays Fahrenheit, humidity, timestamps, and a 24-hour temperature trend after multiple readings arrive. Readings older than one hour are marked stale. While visible, the dashboard reloads saved data every minute.

Apple Home scheduling and permissions must be configured on the iPhone and verified with a real reading. No Home automation has been created by installing this receiver. `node --test tests/homekit.test.mjs` exercises authentication, validation, duplicate handling, and stale/out-of-order data using isolated temporary storage.

## Health source

## Markets and Workout

Markets and Workout are returned alongside the dashboard snapshot (not snapshot source keys).

- **Markets strip:** live SPY and US 10-year (`^TNX`) from Yahoo Finance chart quotes.
- **Positions:** Quiet-list rows (day P/L badges, sparklines) parsed from `~/morning/index.html` when the morning page has been curated.
- **Workout:** today’s session from `~/vaults/personal/fitness/current-program.md` (Mon Day C / Tue Day A / Thu Day B / Sat technique). Labeled **Workout**, never Lift. Override morning HTML with `DASHBOARD_MORNING_HTML`; vault root with `DASHBOARD_PERSONAL_VAULT`.

The health tile reads the latest dated export from `~/vaults/personal/fitness/fitbit-air/raw/`, plus `fitness/current-program.md` and `fitness/training-log.md`. Override the vault root with `DASHBOARD_PERSONAL_VAULT` for local development. It shows Fitbit main-sleep time asleep, Fitbit resting heart rate (excluding duplicate Apple Health sources), and daily steps as of import. Missing metrics stay blank; stale or partial readings are flagged. Training notes are labeled as saved plans/log entries, not inferred workout completion.

The browser receives only display metrics and training summaries, never raw export IDs or credentials. It rereads exports on each dashboard refresh; this reader does not itself sync the wearable or schedule the existing Fitbit importer. Tests: `node --test tests/health.test.mjs`.


## Google Calendar + Gmail

Personal Google Calendar and Gmail for **your personal Google account** only (never the work account). Read-only morning-brief overlays into `GET /api/dashboard`:

- **Calendar**: remaining today in America/Los_Angeles, capped ~12 hours ahead.
- **Overnight** (“While you were away”): inbox mail in the 10 PM–8 AM Pacific window within ~24 hours.
- **Follow-ups** (“A little nudge”): inbox unread, important, or starred from the last 3 days (small cap).

OAuth client secrets and tokens live in `~/.config/personal-dashboard/` (outside git). See [GOOGLE.md](GOOGLE.md) for GCP console steps (reuse fitbit-air-ingest + Web client on port 8766), `npm run oauth:google`, and publishing notes. Unit tests: `npm run test:calendar` and `npm run test:gmail`.

## Weather source

Weather uses the saved city preference, Open-Meteo geocoding, and the daily forecast API. Use a specific location such as `Portland, Oregon`; ambiguous matches are rejected. High/low Fahrenheit and a daily condition icon refresh on dashboard requests, cached for 30 minutes. Failed requests retain only a clearly marked same-day forecast; older forecasts are not presented as today's weather. Source attribution appears on the tile. Location queries are sent to Open-Meteo; no account credentials are needed.

“Use my location” requests browser location permission on the viewing device (including iPhone Safari over the private HTTPS URL). The opt-in is remembered on that browser; location is requested during visible dashboard refreshes with a five-minute maximum cached position age. Denied/unavailable location falls back to the saved city. “Choose city” disables device location. Coordinates are rounded to two decimals before querying Open-Meteo, and only the most recent device forecast is cached on the mini. This is foreground browser location, not continuous iPhone tracking. Forecast days currently follow the dashboard's Pacific timezone, explicitly labeled in the tile.

## Headline sources

**Floor:** BBC World and Technology, TechCrunch AI, CNBC markets, and NPR politics RSS (`lib/headlines.mjs`). Up to two recent titles per topic, publisher links, deduplicated URLs/titles, latest 36 hours. Overnight labels mean 10 PM–8 AM Pacific within the past 24 hours. Feeds refresh on dashboard requests, cached for 30 minutes.

**Curated overlay (preferred when fresh):** If today’s Pacific morning brief exists at `~/vaults/personal/briefs/morning/YYYY-MM-DD.md` and its `## Headlines` section parses to ≥1 markdown link (`- [Title](url) — optional why`, max ~6), `GET /api/dashboard` **replaces** RSS headlines with that curated list. Same freshness idea as overnight mail curation. Agents that skip the vault may `PUT /api/headlines-curation` with a JSON source (same Pacific day, ≥1 item). Vault wins when both are fresh. Missing/stale/empty → RSS floor.

Copy-paste agent instructions: [AGENT_HEADLINES_PROMPT.md](AGENT_HEADLINES_PROMPT.md). Vault README lives only on the mini under `briefs/morning/` (personal is not on GitHub). Edit `lib/headlines.mjs` to change RSS publishers; preference text does not reconfigure feeds.
