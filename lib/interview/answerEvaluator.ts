import { generateStructuredCompletion, type ChatCompletionMessage } from './openaiClient';
import { getFileContent } from './repoAnalyzer';
import type { Question, Evaluation, RepoAnalysis } from '@/types/interview';

interface EvaluationResult {
  score: number;
  isCorrect: boolean;
  feedback: string;
  missedPoints: string[];
  strengths: string[];
  needsHint: boolean;
}

export async function evaluateAnswer(
  question: Question,
  answer: string,
  analysis: RepoAnalysis
): Promise<Evaluation> {
  // Get relevant code for context
  const relevantCode = question.relatedFiles
    .slice(0, 3)
    .map(file => {
      const content = getFileContent(analysis, file);
      if (content) {
        return `=== ${file} ===\n${content.slice(0, 3000)}`;
      }
      return null;
    })
    .filter(Boolean)
    .join('\n\n');

  const messages: ChatCompletionMessage[] = [
    {
      role: 'system',
      content: `You are a strict but fair technical interviewer evaluating a candidate's answer about a codebase. Your evaluation should be:

1. STRICT: The candidate should demonstrate actual understanding, not just regurgitate code
2. FAIR: Give credit for partial understanding and correct insights
3. SPECIFIC: Point out exactly what was missed or incorrect
4. CONSTRUCTIVE: Feedback should help them understand what they missed

Scoring guidelines:
- 90-100: Excellent - Covered all key points with deep understanding
- 70-89: Good - Covered most key points with solid understanding
- 50-69: Partial - Some understanding but missed significant points
- 30-49: Weak - Limited understanding, missed most key points
- 0-29: Insufficient - Did not demonstrate meaningful understanding

Be especially strict about:
- Vague or generic answers that could apply to any codebase
- Incorrect technical claims
- Missing critical details that are clearly visible in the code`,
    },
    {
      role: 'user',
      content: `Evaluate this answer:

QUESTION: ${question.text}

EXPECTED KEY POINTS:
${question.keyPoints.map((p, i) => `${i + 1}. ${p}`).join('\n')}

RELEVANT CODE:
${relevantCode}

CANDIDATE'S ANSWER:
${answer}

Evaluate the answer and respond in JSON format:
{
  "score": <number 0-100>,
  "isCorrect": <boolean - true if score >= 70>,
  "feedback": "Detailed feedback explaining the evaluation",
  "missedPoints": ["specific points they failed to mention or got wrong"],
  "strengths": ["things they got right or demonstrated good understanding of"],
  "needsHint": <boolean - true if score < 50 and they seem stuck>
}`,
    },
  ];

  const result = await generateStructuredCompletion<EvaluationResult>(messages, {
    temperature: 0.3,
    maxTokens: 1500,
  });

  return {
    score: Math.max(0, Math.min(100, result.score)),
    isCorrect: result.score >= 70,
    feedback: result.feedback,
    missedPoints: result.missedPoints || [],
    strengths: result.strengths || [],
    needsHint: result.needsHint || result.score < 50,
  };
}

export function formatEvaluationMessage(evaluation: Evaluation, questionText: string): string {
  const emoji = evaluation.isCorrect ? '✅' : evaluation.score >= 50 ? '🔶' : '❌';
  const scoreLabel =
    evaluation.score >= 90 ? 'Excellent!' :
    evaluation.score >= 70 ? 'Good!' :
    evaluation.score >= 50 ? 'Partial understanding' :
    evaluation.score >= 30 ? 'Needs improvement' :
    'Keep studying';

  let message = `${emoji} **Score: ${evaluation.score}/100** - ${scoreLabel}\n\n`;
  message += `${evaluation.feedback}\n\n`;

  if (evaluation.strengths.length > 0) {
    message += `**What you got right:**\n`;
    for (const strength of evaluation.strengths) {
      message += `- ${strength}\n`;
    }
    message += '\n';
  }

  if (evaluation.missedPoints.length > 0) {
    message += `**Areas to improve:**\n`;
    for (const point of evaluation.missedPoints) {
      message += `- ${point}\n`;
    }
    message += '\n';
  }

  if (evaluation.needsHint) {
    message += `\n💡 *Type "hint" if you'd like a hint to better understand this concept.*`;
  }

  return message;
}
