import { Router, Request, Response } from 'express';
import { appendRow } from '../config/googleClient';
import { SlackSlashCommandBody, slackEphemeral, verifySlackSignature } from '../config/slack';

const router = Router();

const validationError = slackEphemeral(
  'Error: please provide exactly 3 comma-separated values like:\n  /purchase Subteam, Reason, $Amount'
);

const parseText = (text?: string): string[] | null => {
  if (!text) return null;
  const parts = text.split(',').map((p) => p.trim()).filter((p) => p.length > 0);
  if (parts.length !== 3) return null;
  return parts;
};

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

  // Row format: Date, Subteam, Reason, $Amount, User
  const [subteam, reason, amount] = parsed;
  const userName = body.user_name || 'unknown';
  const row = [formatSheetDate(), subteam, reason, amount, userName];

  // Respond to Slack immediately to avoid slash command timeouts on cold starts.
  res
    .status(200)
    .json(slackEphemeral('Purchase received; logging it to the sheet now.'));

  // Perform the Google Sheets write asynchronously in the background.
  (async () => {
    try {
      console.log('[sheets] Appending row:', row);
      await appendRow(row);
    } catch (err) {
      console.error('[error] Failed to append to sheet', err);
    }
  })();
});

export default router;

