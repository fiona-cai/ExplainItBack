import { v4 as uuidv4 } from 'uuid';
import { generateStructuredCompletion, type ChatCompletionMessage } from './openaiClient';
import type { CodeSnippet, Annotation, Question } from '@/types/interview';

interface AnnotationResult {
  annotations: Array<{
    line: number;
    text: string;
    type: 'explanation' | 'key-point' | 'connection' | 'warning';
  }>;
}

export async function annotateCodeSnippet(
  snippet: CodeSnippet,
  question: Question
): Promise<CodeSnippet> {
  const lines = snippet.code.split('\n');
  const numberedCode = lines
    .map((line, i) => `${snippet.startLine + i}: ${line}`)
    .join('\n');

  const messages: ChatCompletionMessage[] = [
    {
      role: 'system',
      content: `You are a code annotation expert. Your job is to add helpful annotations to code snippets that help developers understand the code in the context of a technical interview question.

Annotation types:
- "explanation": Explains what a line or block does
- "key-point": Highlights important concepts related to the question
- "connection": Shows how this code connects to other parts of the system
- "warning": Points out potential issues, edge cases, or gotchas

Guidelines:
- Don't over-annotate - 3-6 annotations per snippet is usually enough
- Focus on lines that are most relevant to the question
- Be concise but informative
- Annotations should add value, not just restate what the code obviously does`,
    },
    {
      role: 'user',
      content: `Add annotations to this code snippet in the context of this interview question:

QUESTION: ${question.text}

KEY POINTS TO COVER:
${question.keyPoints.map((p, i) => `${i + 1}. ${p}`).join('\n')}

CODE (${snippet.file}):
${numberedCode}

Generate annotations in JSON format:
{
  "annotations": [
    {
      "line": <line number from the code>,
      "text": "Annotation text explaining this line",
      "type": "explanation" | "key-point" | "connection" | "warning"
    }
  ]
}

Only annotate lines that exist in the code (lines ${snippet.startLine}-${snippet.endLine}).`,
    },
  ];

  try {
    const result = await generateStructuredCompletion<AnnotationResult>(messages, {
      temperature: 0.5,
      maxTokens: 1024,
      requiredFields: ['annotations'],
    });

    // Validate and filter annotations
    const validAnnotations: Annotation[] = result.annotations
      .filter(a => a.line >= snippet.startLine && a.line <= snippet.endLine)
      .map(a => ({
        line: a.line,
        text: a.text,
        type: a.type,
      }));

    return {
      ...snippet,
      annotations: validAnnotations,
    };
  } catch (error) {
    console.error('Failed to annotate code snippet:', error);
    return snippet;
  }
}

export async function annotateAllSnippets(
  snippets: CodeSnippet[],
  question: Question
): Promise<CodeSnippet[]> {
  const annotatedSnippets: CodeSnippet[] = [];

  for (const snippet of snippets) {
    const annotated = await annotateCodeSnippet(snippet, question);
    annotatedSnippets.push(annotated);
  }

  return annotatedSnippets;
}

export function createSnippetFromCode(
  code: string,
  file: string,
  language: string,
  startLine: number = 1
): CodeSnippet {
  const lines = code.split('\n');
  return {
    id: uuidv4(),
    file,
    startLine,
    endLine: startLine + lines.length - 1,
    code,
    language,
    annotations: [],
  };
}

export function highlightLines(
  snippet: CodeSnippet,
  linesToHighlight: number[]
): CodeSnippet {
  // Add highlight annotations to specified lines
  const highlightAnnotations: Annotation[] = linesToHighlight
    .filter(line => line >= snippet.startLine && line <= snippet.endLine)
    .map(line => ({
      line,
      text: 'Key line for this question',
      type: 'key-point' as const,
    }));

  return {
    ...snippet,
    annotations: [...snippet.annotations, ...highlightAnnotations],
  };
}
