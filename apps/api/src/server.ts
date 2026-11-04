import { createAnthropicAiClient } from './ai-client';
import { createApp } from './app';
import { systemClock } from './clock';
import { loadConfig } from './config';
import { createPrisma } from './db';
import { noopPublisher } from './events';

const { databaseUrl, sessionSecret, port, cookieSecure, anthropicApiKey, aiModel } = loadConfig(process.env);

if (!anthropicApiKey) {
  console.warn('ANTHROPIC_API_KEY is not set, so new Tickets will stay Unclassified.');
}

const { app, classifier } = createApp({
  cookieSecure,
  sessionSecret,
  prisma: createPrisma(databaseUrl),
  clock: systemClock,
  publisher: noopPublisher,
  ai: createAnthropicAiClient({ apiKey: anthropicApiKey, model: aiModel }),
});

app.listen(port, () => {
  console.log(`API listening on port ${port}`);
  classifier.requeueRecent().catch((error: unknown) => console.error(error));
});
