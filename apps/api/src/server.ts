import { createApp } from './app';

const port = Number(process.env.PORT ?? 4000);
const app = createApp({ cookieSecure: process.env.NODE_ENV === 'production' });

app.listen(port, () => {
  console.log(`API listening on port ${port}`);
});
