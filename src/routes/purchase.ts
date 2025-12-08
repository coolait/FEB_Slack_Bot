import { Router, Request, Response } from 'express';
import { appendRow } from '../config/googleClient';
import { SlackSlashCommandBody, slackEphemeral, verifySlackSignature } from '../config/slack';

const router = Router();

const validationError = slackEphemeral(
  'Error: please provide exactly 3 comma-separated values like:\n  /purchase item, category, amount'
);

const parseText = (text?: string): string[] | null => {
  if (!text) return null;
  const parts = text.split(',').map((p) => p.trim()).filter((p) => p.length > 0);
  if (parts.length !== 3) return null;
  return parts;
};

router.post('/', verifySlackSignature, async (req: Request, res: Response) => {
  const body = req.body as SlackSlashCommandBody;

  const values = parseText(body.text);
  if (!values) {
    console.warn('[validation] Invalid input:', body.text);
    return res.status(200).json(validationError);
  }

  try {
    console.log('[sheets] Appending row:', values);
    await appendRow(values);
    return res.status(200).json(slackEphemeral('Purchase logged successfully.'));
  } catch (err) {
    console.error('[error] Failed to append to sheet', err);
    return res
      .status(200)
      .json(slackEphemeral('Could not log purchase right now; try again later.'));
  }
});

export default router;

