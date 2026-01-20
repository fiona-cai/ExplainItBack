import OpenAI from 'openai';

if (!process.env.OPENAI_API_KEY) {
  console.warn('Warning: OPENAI_API_KEY not set in environment variables');
}

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const INTERVIEW_MODEL = 'gpt-4-turbo-preview';

export interface ChatCompletionMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export async function generateCompletion(
  messages: ChatCompletionMessage[],
  options?: {
    temperature?: number;
    maxTokens?: number;
    responseFormat?: 'text' | 'json';
  }
): Promise<string> {
  const { temperature = 0.7, maxTokens = 4096, responseFormat = 'text' } = options || {};

  const response = await openai.chat.completions.create({
    model: INTERVIEW_MODEL,
    messages,
    temperature,
    max_tokens: maxTokens,
    response_format: responseFormat === 'json' ? { type: 'json_object' } : undefined,
  });

  return response.choices[0]?.message?.content || '';
}

export async function generateStructuredCompletion<T>(
  messages: ChatCompletionMessage[],
  options?: {
    temperature?: number;
    maxTokens?: number;
  }
): Promise<T> {
  const content = await generateCompletion(messages, {
    ...options,
    responseFormat: 'json',
  });

  try {
    return JSON.parse(content) as T;
  } catch (error) {
    console.error('Failed to parse JSON response:', content);
    throw new Error('Failed to parse AI response as JSON');
  }
}
