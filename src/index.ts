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

app.use('/api/purchase', purchaseRouter);

const port = process.env.PORT ? Number(process.env.PORT) : 3000;
app.listen(port, () => {
  console.log(`[startup] Listening on port ${port}`);
});

