import { createApp } from './app';
import { systemClock } from './clock';
import { loadConfig } from './config';
import { createPrisma } from './db';
import { noopPublisher } from './events';

const { databaseUrl, sessionSecret, port, cookieSecure } = loadConfig(process.env);

const app = createApp({
  cookieSecure,
  sessionSecret,
  prisma: createPrisma(databaseUrl),
  clock: systemClock,
  publisher: noopPublisher,
});

app.listen(port, () => {
  console.log(`API listening on port ${port}`);
});
