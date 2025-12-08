import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';

export interface SlackSlashCommandBody {
  token?: string;
  team_id?: string;
  team_domain?: string;
  channel_id?: string;
  channel_name?: string;
  user_id?: string;
  user_name?: string;
  command?: string;
  text?: string;
  response_url?: string;
  trigger_id?: string;
}

const version = 'v0';

export const verifySlackSignature = (req: Request, res: Response, next: NextFunction) => {
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  if (!signingSecret) {
    console.warn('[warn] SLACK_SIGNING_SECRET not set; skipping verification.');
    return next();
  }

  const timestamp = req.headers['x-slack-request-timestamp'] as string | undefined;
  const signature = req.headers['x-slack-signature'] as string | undefined;

  if (!timestamp || !signature) {
    return res.status(400).json({ error: 'Missing Slack signature headers.' });
  }

  const fiveMinutes = 60 * 5;
  const currentTs = Math.floor(Date.now() / 1000);
  if (Math.abs(currentTs - Number(timestamp)) > fiveMinutes) {
    return res.status(400).json({ error: 'Stale Slack request.' });
  }

  const rawBody = (req as any).rawBody as string | undefined;
  if (!rawBody) {
    return res.status(400).json({ error: 'Missing raw body for verification.' });
  }

  const basestring = `${version}:${timestamp}:${rawBody}`;
  const hmac = crypto.createHmac('sha256', signingSecret);
  hmac.update(basestring);
  const computed = `${version}=${hmac.digest('hex')}`;

  if (
    !crypto.timingSafeEqual(Buffer.from(computed, 'utf8'), Buffer.from(signature, 'utf8'))
  ) {
    return res.status(401).json({ error: 'Invalid Slack signature.' });
  }

  return next();
};

export const slackEphemeral = (text: string) => ({
  response_type: 'ephemeral' as const,
  text,
});

