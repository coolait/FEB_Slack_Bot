/**
 * FastCGI entry point for OCF standard web hosting (public_html).
 * Run with: node dist/fcgi.js (Apache/mod_fcgid runs this via a .fcgi wrapper).
 */
import path from 'path';
import dotenv from 'dotenv';

// Load .env from project root (parent of dist/)
dotenv.config({ path: path.join(__dirname, '..', '.env') });

import * as fcgi from 'node-fastcgi';
import { appendRow } from './config/googleClient';
import { verifySlackRequest, slackEphemeral } from './config/slack';
import type { SlackSlashCommandBody } from './config/slack';

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

    const form = parseFormBody(rawBody) as unknown as SlackSlashCommandBody;
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
// Skipping the isService() check so we don't exit(1) when Apache runs us.
server.listen(() => console.log('[fcgi] Listening on stdin'));
