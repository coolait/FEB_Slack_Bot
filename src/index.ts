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

// OCF uses a Unix socket path in PORT; elsewhere use a numeric port.
const portOrSocket = process.env.PORT;
const isSocket = typeof portOrSocket === 'string' && (portOrSocket.endsWith('.sock') || portOrSocket.startsWith('/'));

if (isSocket && portOrSocket) {
  app.listen(portOrSocket, () => {
    console.log(`[startup] Listening on socket ${portOrSocket}`);
  });
} else {
  const port = portOrSocket ? Number(portOrSocket) : 3000;
  app.listen(port, () => {
    console.log(`[startup] Listening on port ${port}`);
  });
}

