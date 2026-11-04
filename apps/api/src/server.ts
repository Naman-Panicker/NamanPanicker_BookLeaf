import { createGeminiAiClient } from './ai-client';
import { createApp } from './app';
import { systemClock } from './clock';
import { loadConfig } from './config';
import { createPrisma } from './db';
import { noopPublisher } from './events';

const { databaseUrl, sessionSecret, port, cookieSecure, geminiApiKey, aiModel } = loadConfig(process.env);

if (!geminiApiKey) {
  console.warn('GEMINI_API_KEY is not set, so new Tickets will stay Unclassified and there will be no Drafts.');
}

const { app, classifier } = createApp({
  cookieSecure,
  sessionSecret,
  prisma: createPrisma(databaseUrl),
  clock: systemClock,
  publisher: noopPublisher,
  ai: createGeminiAiClient({ apiKey: geminiApiKey, model: aiModel }),
});

app.listen(port, () => {
  console.log(`API listening on port ${port}`);
  classifier.requeueRecent().catch((error: unknown) => console.error(error));
});
