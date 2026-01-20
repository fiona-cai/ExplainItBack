import { generateCompletion, type ChatCompletionMessage } from './openaiClient';
import { getFileContent } from './repoAnalyzer';
import type { Question, RepoAnalysis } from '@/types/interview';

export async function generateHint(
  question: Question,
  analysis: RepoAnalysis,
  hintLevel: number = 1
): Promise<string> {
  // Get relevant code for context
  const relevantCode = question.relatedFiles
    .slice(0, 2)
    .map(file => {
      const content = getFileContent(analysis, file);
      if (content) {
        return `=== ${file} ===\n${content.slice(0, 2000)}`;
      }
      return null;
    })
    .filter(Boolean)
    .join('\n\n');

  const hintGuidelines = {
    1: `Give a SUBTLE hint that points them in the right direction without revealing the answer.
       - Mention which file or function to look at
       - Suggest what concept or pattern they should think about
       - DO NOT explain the actual answer`,
    2: `Give a MORE DIRECT hint that helps them understand the approach.
       - Explain the general mechanism or pattern being used
       - Point to specific lines or sections to examine
       - Still don't give the complete answer`,
    3: `Give a DETAILED hint that walks them through the reasoning.
       - Explain the key concept they need to understand
       - Show how different parts connect
       - Stop just short of the full answer`,
  };

  const guideline = hintGuidelines[hintLevel as keyof typeof hintGuidelines] || hintGuidelines[1];

  const messages: ChatCompletionMessage[] = [
    {
      role: 'system',
      content: `You are a helpful technical mentor. A candidate is struggling with a technical interview question. Your job is to give them a hint that helps them think through the problem without just giving them the answer.

${guideline}

Be encouraging but don't be condescending. The goal is to help them learn and discover the answer themselves.`,
    },
    {
      role: 'user',
      content: `The candidate needs a hint for this question:

QUESTION: ${question.text}

KEY POINTS THEY SHOULD DISCOVER:
${question.keyPoints.map((p, i) => `${i + 1}. ${p}`).join('\n')}

RELEVANT CODE:
${relevantCode}

Generate a helpful hint (hint level ${hintLevel} of 3).`,
    },
  ];

  const hint = await generateCompletion(messages, {
    temperature: 0.7,
    maxTokens: 500,
  });

  return hint;
}

export function formatHintMessage(hint: string, hintLevel: number): string {
  const levelLabel = hintLevel === 1 ? 'Gentle' : hintLevel === 2 ? 'Moderate' : 'Strong';
  return `💡 **${levelLabel} Hint:**\n\n${hint}`;
}
