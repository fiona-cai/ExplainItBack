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

export type Validator<T> = (data: unknown) => data is T;

export async function generateStructuredCompletion<T>(
  messages: ChatCompletionMessage[],
  options?: {
    temperature?: number;
    maxTokens?: number;
    validator?: Validator<T>;
    requiredFields?: string[];
  }
): Promise<T> {
  const content = await generateCompletion(messages, {
    ...options,
    responseFormat: 'json',
  });

  try {
    const parsed = JSON.parse(content);

    // Validate required fields if specified
    if (options?.requiredFields) {
      const missingFields = options.requiredFields.filter(
        field => parsed[field] === undefined || parsed[field] === null
      );
      if (missingFields.length > 0) {
        console.error('AI response missing required fields:', missingFields, 'Response:', content);
        throw new Error(`AI response missing required fields: ${missingFields.join(', ')}`);
      }
    }

    // Run custom validator if provided
    if (options?.validator && !options.validator(parsed)) {
      console.error('AI response failed validation:', content);
      throw new Error('AI response failed validation');
    }

    return parsed as T;
  } catch (error) {
    if (error instanceof SyntaxError) {
      console.error('Failed to parse JSON response:', content);
      throw new Error('Failed to parse AI response as JSON');
    }
    throw error;
  }
}
