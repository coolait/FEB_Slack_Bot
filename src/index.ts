import dotenv from 'dotenv';
import express from 'express';
import purchaseRouter from './routes/purchase';

dotenv.config();

const app = express();

// Capture raw body for Slack signature verification
app.use(
  express.urlencoded({
    extended: true,
    verify: (req: any, _res, buf) => {
      req.rawBody = buf.toString();
    },
  })
);

// Health/root so visiting the URL in a browser doesn't show "Cannot GET /"
app.get('/', (_req, res) => {
  res.send('Slack Purchase Logger is running. Use POST /api/purchase for the slash command.');
});

app.use('/api/purchase', purchaseRouter);

const port = process.env.PORT ? Number(process.env.PORT) : 3000;
app.listen(port, () => {
  console.log(`[startup] Listening on port ${port}`);
});

