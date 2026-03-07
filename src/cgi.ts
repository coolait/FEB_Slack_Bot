/**
 * CGI entry point for OCF: one request per process. No FastCGI listen.
 * Use when the server runs the script once per request (CGI-style).
 * Wrapper: exec node dist/cgi.js (from ~/myapp).
 */
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

const projectRoot = path.join(__dirname, '..');
dotenv.config({ path: path.join(projectRoot, '.env') });

const { appendRow } = require('./config/googleClient');
const { verifySlackRequest, slackEphemeral } = require('./config/slack');

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

function cgiOut(status: number, contentType: string, body: string) {
  process.stdout.write(`Status: ${status} OK\r\nContent-Type: ${contentType}\r\n\r\n${body}`);
}

function readStdinSync(length: number): string {
  if (length <= 0) return '';
  const buf = Buffer.alloc(length);
  const n = fs.readSync(0, buf, 0, length, 0);
  return buf.slice(0, n).toString('utf8');
}

async function main() {
  const method = (process.env.REQUEST_METHOD || 'GET').toUpperCase();

  if (method === 'GET') {
    cgiOut(200, 'text/plain', 'Slack purchase logger is running. Use POST from Slack slash command.');
    process.exit(0);
    return;
  }

  if (method !== 'POST') {
    cgiOut(405, 'application/json', JSON.stringify({ error: 'Method Not Allowed' }));
    process.exit(0);
    return;
  }

  const contentLength = parseInt(process.env.CONTENT_LENGTH || '0', 10);
  const rawBody = readStdinSync(contentLength);
  const timestamp = process.env.HTTP_X_SLACK_REQUEST_TIMESTAMP;
  const signature = process.env.HTTP_X_SLACK_SIGNATURE;

  const err = verifySlackRequest(rawBody, timestamp, signature);
  if (err) {
    cgiOut(err.status, 'application/json', JSON.stringify(err.body));
    process.exit(0);
    return;
  }

  const form = parseFormBody(rawBody) as { text?: string; user_name?: string };
  const parsed = parseText(form.text);
  if (!parsed) {
    cgiOut(200, 'application/json', JSON.stringify(validationError));
    process.exit(0);
    return;
  }

  const [subteam, reason, amount] = parsed;
  const userName = form.user_name || 'unknown';
  const row = [formatSheetDate(), subteam, reason, amount, userName];

  cgiOut(200, 'application/json', JSON.stringify(slackEphemeral('Purchase received; logging it to the sheet now.')));

  try {
    await appendRow(row);
  } catch (e) {
    // Already responded; log only
    try {
      fs.appendFileSync(path.join(projectRoot, 'cgi-error.log'), `${new Date().toISOString()} ${String(e)}\n`);
    } catch (_) {}
  }
  process.exit(0);
}

main().catch((e) => {
  try {
    fs.appendFileSync(path.join(projectRoot, 'cgi-error.log'), `${new Date().toISOString()} ${String(e)}\n`);
  } catch (_) {}
  cgiOut(500, 'text/plain', 'Internal Server Error');
  process.exit(1);
});
