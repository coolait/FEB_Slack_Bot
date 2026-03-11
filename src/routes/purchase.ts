import { Router, Request, Response } from 'express';
import { appendRow } from '../config/googleClient';
import { SlackSlashCommandBody, slackEphemeral, verifySlackSignature } from '../config/slack';

const router = Router();

const validationError = slackEphemeral(
  'Error: please provide exactly 3 comma-separated values like:\n  /purchase Subteam, Reason, $Amount'
);

/** Returns [parts, postToChannel]. postToChannel is true if text ends with -m. */
function parseText(text?: string): { parts: string[]; postToChannel: boolean } | null {
  if (!text) return null;
  const trimmed = text.trim();
  const postToChannel = / -m$/i.test(trimmed);
  const toParse = postToChannel ? trimmed.replace(/ -m$/i, '').trim() : trimmed;
  const parts = toParse.split(',').map((p) => p.trim()).filter((p) => p.length > 0);
  if (parts.length !== 3) return null;
  return { parts, postToChannel };
}

/** Post a message to a channel (requires SLACK_BOT_TOKEN and bot in channel). */
async function postChannelMessage(channelId: string, text: string): Promise<void> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) return;
  const res = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ channel: channelId, text }),
  });
  if (!res.ok) {
    console.error('[slack] chat.postMessage failed', res.status, await res.text());
  }
}

/** Current date as MM/DD/YYYY for the sheet. */
const formatSheetDate = (): string => {
  const d = new Date();
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const year = d.getFullYear();
  return `${month}/${day}/${year}`;
};

router.post('/', verifySlackSignature, async (req: Request, res: Response) => {
  const body = req.body as SlackSlashCommandBody;

  const parsed = parseText(body.text);
  if (!parsed) {
    console.warn('[validation] Invalid input:', body.text);
    return res.status(200).json(validationError);
  }

  const { parts, postToChannel } = parsed;
  // Row format: Date, Subteam, Reason, $Amount, User
  const [subteam, reason, amount] = parts;
  const userName = body.user_name || 'unknown';
  const row = [formatSheetDate(), subteam, reason, amount, userName];

  // Respond to Slack immediately to avoid slash command timeouts on cold starts.
  res
    .status(200)
    .json(slackEphemeral('Purchase received; logging it to the sheet now.'));

  // Sheets append + optional channel message in the background.
  (async () => {
    try {
      console.log('[sheets] Appending row:', row);
      await appendRow(row);
    } catch (err) {
      console.error('[error] Failed to append to sheet', err);
    }
    if (postToChannel && body.channel_id) {
      try {
        await postChannelMessage(body.channel_id, 'Making the purchase....');
      } catch (err) {
        console.error('[error] Failed to post channel message', err);
      }
    }
  })();
});

export default router;

