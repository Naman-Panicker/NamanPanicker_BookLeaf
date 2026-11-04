import { categorySchema, prioritySchema } from '@bookleaf/shared';
import { FinishReason, GoogleGenAI, type GenerateContentResponse } from '@google/genai';

export type AiPrompt = { system: string; user: string };

// Stops an Author's text from closing the tag around it and passing the rest off as instructions.
export function escapeTags(text: string) {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

export type AiClient = {
  // Resolves to whatever came back. The caller checks it, so a malformed answer fails the same way from any client.
  classify(prompt: AiPrompt): Promise<unknown>;
  draft(prompt: AiPrompt): Promise<unknown>;
};

// Room for thinking as well as the answer, because thinking counts towards the limit.
const CLASSIFY_MAX_TOKENS = 1024;
const DRAFT_MAX_TOKENS = 4096;
const ATTEMPT_TIMEOUT_MS = 20_000;
// An Admin is waiting and nothing else tries again, so a Draft gets longer and one retry from the SDK.
const DRAFT_HTTP_OPTIONS = { timeout: 30_000, retryOptions: { attempts: 2 } };

const CLASSIFICATION_FORMAT = {
  type: 'object',
  properties: {
    category: { type: 'string', enum: categorySchema.options },
    priority: { type: 'string', enum: prioritySchema.options },
  },
  required: ['category', 'priority'],
};

// A refusal or a cut-off answer has nothing worth reading, and saying why helps whoever reads the error.
function textOfFinished(response: GenerateContentResponse) {
  const finishReason = response.candidates?.[0]?.finishReason;
  if (finishReason !== FinishReason.STOP) {
    throw new Error(`The AI stopped early: ${finishReason ?? response.promptFeedback?.blockReason ?? 'no answer'}.`);
  }
  return response.text;
}

export function createGeminiAiClient({ apiKey, model }: { apiKey: string | null; model: string }): AiClient {
  // The SDK won't start without a key, and the API has to.
  if (!apiKey) {
    const noKey = () => Promise.reject(new Error('GEMINI_API_KEY is not set.'));
    return { classify: noKey, draft: noKey };
  }

  // Classification counts its own attempts, so it leaves the SDK's retries off, which is their default.
  const client = new GoogleGenAI({ apiKey, httpOptions: { timeout: ATTEMPT_TIMEOUT_MS } });
  return {
    async classify({ system, user }) {
      const response = await client.models.generateContent({
        model,
        contents: user,
        config: {
          systemInstruction: system,
          maxOutputTokens: CLASSIFY_MAX_TOKENS,
          responseMimeType: 'application/json',
          responseJsonSchema: CLASSIFICATION_FORMAT,
        },
      });
      const answer = textOfFinished(response);
      return answer && JSON.parse(answer);
    },
    async draft({ system, user }) {
      const response = await client.models.generateContent({
        model,
        contents: user,
        config: { systemInstruction: system, maxOutputTokens: DRAFT_MAX_TOKENS, httpOptions: DRAFT_HTTP_OPTIONS },
      });
      return textOfFinished(response);
    },
  };
}
