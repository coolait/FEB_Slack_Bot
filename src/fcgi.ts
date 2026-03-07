/**
 * FastCGI entry point for OCF standard web hosting (public_html).
 * Run with: node dist/fcgi.js (Apache/mod_fcgid runs this via a .fcgi wrapper).
 */
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

const projectRoot = path.join(__dirname, '..');
const errorLogPath = path.join(projectRoot, 'fcgi-error.log');

function logStartupError(err: unknown) {
  const msg = err instanceof Error ? err.stack || err.message : String(err);
  try {
    fs.appendFileSync(errorLogPath, `[${new Date().toISOString()}] ${msg}\n`);
  } catch (_) {}
}

try {
  dotenv.config({ path: path.join(projectRoot, '.env') });
} catch (e) {
  logStartupError(e);
  throw e;
}

let fcgi: typeof import('node-fastcgi');
let appendRow: typeof import('./config/googleClient').appendRow;
let verifySlackRequest: typeof import('./config/slack').verifySlackRequest;
let slackEphemeral: typeof import('./config/slack').slackEphemeral;

try {
  fcgi = require('node-fastcgi');
  const googleClient = require('./config/googleClient');
  const slack = require('./config/slack');
  appendRow = googleClient.appendRow;
  verifySlackRequest = slack.verifySlackRequest;
  slackEphemeral = slack.slackEphemeral;
} catch (e) {
  logStartupError(e);
  throw e;
}

const validationError = slackEphemeral(
  'Error: please provide exactly 3 comma-separated values like:\n  /purchase Subteam, Reason, $Amount'
);

function parseText(text?: string): string[] | null {
  if (!text) return null;
  const parts = text.split(',').map((p) => p.trim()).filter((p) => p.length > 0);
  if (parts.length !== 3) return null;
  return parts;
}

function formatSheetDate(): string {
  const d = new Date();
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}

function parseFormBody(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of raw.split('&')) {
    const [k, v] = pair.split('=').map((s) => (s != null ? decodeURIComponent(s.replace(/\+/g, ' ')) : ''));
    if (k) out[k] = v ?? '';
  }
  return out;
}

const server = fcgi.createServer((req: import('http').IncomingMessage, res: import('http').ServerResponse) => {
  if (req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Slack purchase logger is running. Use POST from Slack slash command.');
    return;
  }
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method Not Allowed' }));
    return;
  }

  let body = '';
  req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
  req.on('end', () => {
    const rawBody = body;
    const timestamp = req.headers['x-slack-request-timestamp'] as string | undefined;
    const signature = req.headers['x-slack-signature'] as string | undefined;

    const err = verifySlackRequest(rawBody, timestamp, signature);
    if (err) {
      res.writeHead(err.status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(err.body));
      return;
    }

    const form = parseFormBody(rawBody) as { text?: string; user_name?: string };
    const parsed = parseText(form.text);
    if (!parsed) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(validationError));
      return;
    }

    const [subteam, reason, amount] = parsed;
    const userName = form.user_name || 'unknown';
    const row = [formatSheetDate(), subteam, reason, amount, userName];

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(slackEphemeral('Purchase received; logging it to the sheet now.')));

    (async () => {
      try {
        await appendRow(row);
      } catch (e) {
        console.error('[error] Failed to append to sheet', e);
      }
    })();
  });
});

// Always try to listen on stdin (fd 0). Apache/mod_fcgid passes the FastCGI socket there.
try {
  server.listen(() => console.log('[fcgi] Listening on stdin'));
} catch (e) {
  logStartupError(e);
  throw e;
}
