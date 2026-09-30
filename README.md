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
