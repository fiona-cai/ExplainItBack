import { v4 as uuidv4 } from 'uuid';
import { generateStructuredCompletion, type ChatCompletionMessage } from './openaiClient';
import { getFileContent, findRelatedFiles } from './repoAnalyzer';
import type { Question, RepoAnalysis, CodeSnippet } from '@/types/interview';

interface GeneratedQuestion {
  text: string;
  relatedFiles: string[];
  keyPoints: string[];
  codeSnippets: Array<{
    file: string;
    startLine: number;
    endLine: number;
    relevance: string;
  }>;
}

function getLanguageFromPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase();
  const languageMap: Record<string, string> = {
    ts: 'typescript',
    tsx: 'tsx',
    js: 'javascript',
    jsx: 'jsx',
    py: 'python',
    rb: 'ruby',
    go: 'go',
    rs: 'rust',
    java: 'java',
    kt: 'kotlin',
    swift: 'swift',
    c: 'c',
    cpp: 'cpp',
    cs: 'csharp',
    php: 'php',
    html: 'html',
    css: 'css',
    json: 'json',
    yaml: 'yaml',
    yml: 'yaml',
    md: 'markdown',
    sql: 'sql',
    sh: 'bash',
  };
  return languageMap[ext || ''] || 'text';
}

function extractCodeSnippet(
  content: string,
  startLine: number,
  endLine: number,
  file: string
): CodeSnippet {
  const lines = content.split('\n');
  const snippetLines = lines.slice(startLine - 1, endLine);

  return {
    id: uuidv4(),
    file,
    startLine,
    endLine,
    code: snippetLines.join('\n'),
    language: getLanguageFromPath(file),
    annotations: [],
  };
}

export async function generateQuestion(
  analysis: RepoAnalysis,
  previousQuestionIds: string[],
  focusArea?: string
): Promise<Question> {
  // Build context from the analysis
  const availableFiles = Object.keys(analysis.fileContents);
  const entryPoints = analysis.mainEntryPoints.join('\n');
  const patterns = analysis.patterns.join(', ');
  const libraries = analysis.librariesUsed.join(', ');

  // Sample some file contents for context
  const sampledFiles = availableFiles
    .filter(f => {
      if (focusArea) {
        return f.includes(focusArea);
      }
      return true;
    })
    .slice(0, 8)
    .map(path => {
      const content = analysis.fileContents[path];
      return `=== ${path} ===\n${content?.slice(0, 2500) || 'Content not available'}`;
    })
    .join('\n\n');

  const messages: ChatCompletionMessage[] = [
    {
      role: 'system',
      content: `You are a senior technical interviewer conducting a deep-dive code review interview. Your job is to generate challenging, probing questions that test the candidate's understanding of the codebase.

Guidelines for questions:
1. Focus on WHY decisions were made, not just WHAT the code does
2. Ask about edge cases, error handling, and potential improvements
3. Connect different parts of the codebase to test holistic understanding
4. Ask about trade-offs and alternative approaches
5. Questions should require actual code understanding, not guessing
6. Be specific - reference actual functions, classes, and patterns in the code
7. Make questions challenging but fair - they should have clear answers based on the code

Question types to vary between:
- Architecture and design decisions
- Error handling and edge cases
- Performance and optimization
- Security considerations
- Testing strategies
- Code maintainability
- Integration between components`,
    },
    {
      role: 'user',
      content: `Generate a challenging technical interview question about this codebase.

CODEBASE SUMMARY:
${analysis.summary}

ENTRY POINTS:
${entryPoints}

PATTERNS USED: ${patterns}

LIBRARIES: ${libraries}

${focusArea ? `FOCUS AREA: Questions should relate to ${focusArea}` : ''}

CODE SAMPLES:
${sampledFiles}

${previousQuestionIds.length > 0 ? `Note: ${previousQuestionIds.length} questions have already been asked. Generate a NEW question on a DIFFERENT topic.` : ''}

Generate a question in JSON format:
{
  "text": "The complete question text, being specific and technical",
  "relatedFiles": ["list of file paths relevant to answering this question"],
  "keyPoints": ["point 1 they should mention", "point 2 they should mention", "point 3 they should mention"],
  "codeSnippets": [
    {
      "file": "path/to/file.ts",
      "startLine": 10,
      "endLine": 25,
      "relevance": "Why this snippet is relevant to the question"
    }
  ]
}

The question should be answerable by studying the provided code but require deep understanding.`,
    },
  ];

  const generated = await generateStructuredCompletion<GeneratedQuestion>(messages, {
    temperature: 0.8,
    maxTokens: 2048,
    requiredFields: ['text', 'relatedFiles', 'keyPoints', 'codeSnippets'],
  });

  // Extract actual code snippets from the analysis
  const codeSnippets: CodeSnippet[] = [];
  for (const snippet of generated.codeSnippets) {
    const content = getFileContent(analysis, snippet.file);
    if (content) {
      const extracted = extractCodeSnippet(
        content,
        snippet.startLine,
        snippet.endLine,
        snippet.file
      );
      codeSnippets.push(extracted);
    }
  }

  // Add snippets from related files if we don't have enough
  if (codeSnippets.length < 1 && generated.relatedFiles.length > 0) {
    for (const file of generated.relatedFiles) {
      const content = getFileContent(analysis, file);
      if (content) {
        const lines = content.split('\n');
        const startLine = 1;
        const endLine = Math.min(lines.length, 30);
        codeSnippets.push(extractCodeSnippet(content, startLine, endLine, file));
        break;
      }
    }
  }

  return {
    id: uuidv4(),
    text: generated.text,
    relatedFiles: generated.relatedFiles,
    keyPoints: generated.keyPoints,
    codeSnippets,
    difficulty: 'hard',
    generatedAt: Date.now(),
  };
}

export async function generateFollowUpQuestion(
  analysis: RepoAnalysis,
  previousQuestion: Question,
  userAnswer: string,
  evaluation: { missedPoints: string[] }
): Promise<Question | null> {
  // Only generate follow-up if there were significant missed points
  if (evaluation.missedPoints.length < 2) {
    return null;
  }

  const messages: ChatCompletionMessage[] = [
    {
      role: 'system',
      content: `You are a senior technical interviewer. Based on the candidate's previous answer, generate a follow-up question that probes deeper into the areas they missed or didn't fully explain.`,
    },
    {
      role: 'user',
      content: `Previous question: ${previousQuestion.text}

Candidate's answer: ${userAnswer}

Points they missed:
${evaluation.missedPoints.map(p => `- ${p}`).join('\n')}

Related files: ${previousQuestion.relatedFiles.join(', ')}

Generate a follow-up question that helps them think more deeply about what they missed. Format as JSON:
{
  "text": "The follow-up question",
  "relatedFiles": ["same or related files"],
  "keyPoints": ["what they should realize from this follow-up"],
  "codeSnippets": []
}`,
    },
  ];

  try {
    const generated = await generateStructuredCompletion<GeneratedQuestion>(messages, {
      temperature: 0.7,
      maxTokens: 1024,
    });

    // Get code snippets
    const codeSnippets: CodeSnippet[] = [];
    for (const file of generated.relatedFiles.slice(0, 2)) {
      const content = getFileContent(analysis, file);
      if (content) {
        const lines = content.split('\n');
        const endLine = Math.min(lines.length, 25);
        codeSnippets.push(extractCodeSnippet(content, 1, endLine, file));
      }
    }

    return {
      id: uuidv4(),
      text: generated.text,
      relatedFiles: generated.relatedFiles,
      keyPoints: generated.keyPoints,
      codeSnippets,
      difficulty: 'hard',
      generatedAt: Date.now(),
    };
  } catch {
    return null;
  }
}
