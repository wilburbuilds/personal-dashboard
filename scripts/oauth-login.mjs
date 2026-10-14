#!/usr/bin/env node
/**
 * Local loopback OAuth for personal Google Calendar + Gmail.
 * Reads ~/.config/home-dashboard/google/oauth.json, opens consent, captures code on
 * http://127.0.0.1:8766/oauth/callback, writes tokens.json (mode 0600).
 * Scopes: calendar.readonly + gmail.readonly (prompt=consent so refresh gains new scopes).
 * Do not commit oauth.json or tokens.
 */
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile, chmod } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { configDirectory, oauthPath, tokensPath, saveTokens } from '../lib/calendar.mjs';
import { GOOGLE_SCOPES } from '../lib/gmail.mjs';

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

async function loadOAuth() {
  const path = oauthPath();
  let raw;
  try {
    raw = await readFile(path, 'utf8');
  } catch {
    console.error(`Missing ${path}`);
    console.error('Copy google-oauth.example.json → ~/.config/home-dashboard/google/oauth.json and paste client_id / client_secret.');
    process.exit(1);
  }
  const cfg = JSON.parse(raw);
  const client_id = String(cfg.client_id || '').trim();
  const client_secret = String(cfg.client_secret || '').trim();
  const redirect_uri = String(cfg.redirect_uri || 'http://127.0.0.1:8766/oauth/callback').trim();
  const token_path = String(cfg.token_path || tokensPath()).replace(/^~(?=\/|$)/, homedir());
  if (!client_id || !client_secret) {
    console.error('Set client_id and client_secret in oauth.json');
    process.exit(1);
  }
  return { client_id, client_secret, redirect_uri, token_path };
}

function waitForCode(redirectUri, expectedState) {
  const u = new URL(redirectUri);
  const host = u.hostname || '127.0.0.1';
  const port = Number(u.port || 8766);
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      try {
        const reqUrl = new URL(req.url || '/', `http://${host}:${port}`);
        if (reqUrl.pathname !== '/oauth/callback') {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Not found');
          return;
        }
        const err = reqUrl.searchParams.get('error');
        const code = reqUrl.searchParams.get('code');
        const state = reqUrl.searchParams.get('state');
        if (err) {
          res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`<h1>OAuth error</h1><pre>${err}</pre>`);
          server.close();
          reject(new Error(err));
          return;
        }
        if (!code || state !== expectedState) {
          res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end('<h1>Invalid callback</h1><p>Missing code or state mismatch.</p>');
          server.close();
          reject(new Error('missing_code_or_bad_state'));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(
          '<h1>Personal dashboard: Google authorized</h1><p>Calendar + Gmail readonly granted. You can close this tab and return to the terminal.</p>',
        );
        server.close();
        resolve(code);
      } catch (error) {
        server.close();
        reject(error);
      }
    });
    server.on('error', reject);
    server.listen(port, host, () => {
      console.log(`Listening on http://${host}:${port}/oauth/callback`);
    });
  });
}

async function exchangeCode(oauth, code) {
  const body = new URLSearchParams({
    code,
    client_id: oauth.client_id,
    client_secret: oauth.client_secret,
    redirect_uri: oauth.redirect_uri,
    grant_type: 'authorization_code',
  });
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Token exchange failed HTTP ${res.status}: ${JSON.stringify(json)}`);
  }
  return json;
}

async function main() {
  const oauth = await loadOAuth();
  await mkdir(configDirectory(), { recursive: true, mode: 0o700 });

  const state = randomBytes(24).toString('base64url');
  const params = new URLSearchParams({
    client_id: oauth.client_id,
    redirect_uri: oauth.redirect_uri,
    response_type: 'code',
    scope: GOOGLE_SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
    // Optional account hint (GOOGLE_ACCOUNT_HINT); the user still picks the account.
    ...(process.env.GOOGLE_ACCOUNT_HINT ? { login_hint: process.env.GOOGLE_ACCOUNT_HINT } : {}),
  });
  const authUrl = `${AUTH_URL}?${params}`;

  if (process.env.GOOGLE_ACCOUNT_HINT) console.log(`Sign in as ${process.env.GOOGLE_ACCOUNT_HINT}.`);
  console.log('Opening browser for Google consent…');
  console.log(`(If it does not open: ${authUrl})`);

  const codePromise = waitForCode(oauth.redirect_uri, state);

  // Prefer macOS open; fall back to printing URL.
  try {
    const { spawn } = await import('node:child_process');
    spawn('open', [authUrl], { detached: true, stdio: 'ignore' }).unref();
  } catch {
    /* printed above */
  }

  const code = await codePromise;
  const tokens = await exchangeCode(oauth, code);
  if (!tokens.refresh_token) {
    console.warn(
      'WARNING: no refresh_token. Revoke prior grants at https://myaccount.google.com/permissions, ensure prompt=consent + access_type=offline, then re-run.',
    );
  }
  const saved = {
    ...tokens,
    obtained_at: new Date().toISOString(),
    account_hint: process.env.GOOGLE_ACCOUNT_HINT || null,
  };
  await saveTokens(saved, oauth.token_path);
  try {
    await chmod(oauth.token_path, 0o600);
  } catch {
    /* ignore */
  }
  console.log(`Saved tokens → ${oauth.token_path} (mode 0600)`);
  console.log('Success. Restart the dashboard service (or wait for the next refresh) to load calendar + Gmail overnight/followups.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
