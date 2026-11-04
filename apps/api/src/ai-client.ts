import Anthropic from '@anthropic-ai/sdk';
import { categorySchema, prioritySchema } from '@bookleaf/shared';

export type AiPrompt = { system: string; user: string };

export type AiClient = {
  // Resolves to whatever came back. The caller checks it, so a malformed answer fails the same way from any client.
  classify(prompt: AiPrompt): Promise<unknown>;
};

// Room for adaptive thinking as well as the short answer, because thinking counts towards the limit.
const CLASSIFY_MAX_TOKENS = 1024;
const ATTEMPT_TIMEOUT_MS = 20_000;

// Written out, because the SDK's zodOutputFormat turns an enum into a description, which restricts nothing.
const CLASSIFICATION_FORMAT = {
  type: 'json_schema',
  schema: {
    type: 'object',
    properties: {
      category: { type: 'string', enum: categorySchema.options },
      priority: { type: 'string', enum: prioritySchema.options },
    },
    required: ['category', 'priority'],
    additionalProperties: false,
  },
} satisfies Anthropic.JSONOutputFormat;

export function createAnthropicAiClient({ apiKey, model }: { apiKey: string | null; model: string }): AiClient {
  // Without a key the SDK would go looking for other credentials on the machine, and the key comes from the environment only.
  if (!apiKey) return { classify: () => Promise.reject(new Error('ANTHROPIC_API_KEY is not set.')) };

  // Classification counts its own attempts, so the SDK mustn't multiply them with retries of its own.
  const client = new Anthropic({ apiKey, maxRetries: 0, timeout: ATTEMPT_TIMEOUT_MS });
  return {
    async classify({ system, user }) {
      const message = await client.messages.create({
        model,
        max_tokens: CLASSIFY_MAX_TOKENS,
        system,
        messages: [{ role: 'user', content: user }],
        output_config: { effort: 'low', format: CLASSIFICATION_FORMAT },
      });
      // A refusal or a cut-off answer has nothing worth reading, and saying why helps whoever reads the error.
      if (message.stop_reason !== 'end_turn') throw new Error(`The AI stopped early: ${message.stop_reason}.`);
      // Found by type, because thinking blocks can come first.
      const answer = message.content.find((block) => block.type === 'text');
      return answer && JSON.parse(answer.text);
    },
  };
}
