import express from 'express';
import { rateLimitExpress } from 'flowguard/express';

const app = express();

app.use(rateLimitExpress({
  max: 10,
  window: '1m',
  debug: true,
}));

app.get('/', (_req, res) => {
  res.json({ message: 'Hello from Flowguard!' });
});

app.listen(3000, () => {
  console.log('Express app listening on http://localhost:3000');
  console.log('Try: curl -i http://localhost:3000');
});
