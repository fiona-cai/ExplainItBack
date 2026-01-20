// Interview Feature Type Definitions

export interface InterviewSession {
  sessionId: string;
  repoUrl: string;
  repoId: string;
  selectedDirectories: string[];
  messages: ChatMessage[];
  currentQuestion: Question | null;
  questionsAsked: string[];
  analysisCache: RepoAnalysis | null;
  createdAt: number;
  lastActivity: number;
  status: 'initializing' | 'selecting_dirs' | 'analyzing' | 'active' | 'ended';
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  metadata?: {
    type?: 'question' | 'answer' | 'evaluation' | 'hint' | 'system' | 'directory_selection';
    questionId?: string;
    score?: number;
    codeSnippets?: CodeSnippet[];
    directories?: string[];
  };
}

export interface Question {
  id: string;
  text: string;
  relatedFiles: string[];
  keyPoints: string[];
  codeSnippets: CodeSnippet[];
  difficulty: 'hard';
  generatedAt: number;
}

export interface CodeSnippet {
  id: string;
  file: string;
  startLine: number;
  endLine: number;
  code: string;
  language: string;
  annotations: Annotation[];
}

export interface Annotation {
  line: number;
  text: string;
  type: 'explanation' | 'key-point' | 'connection' | 'warning';
}

export interface RepoAnalysis {
  structure: FileNode[];
  mainEntryPoints: string[];
  dependencies: Record<string, string[]>;
  patterns: string[];
  librariesUsed: string[];
  summary: string;
  analyzedAt: number;
  fileContents: Record<string, string>;
}

export interface FileNode {
  path: string;
  name: string;
  type: 'file' | 'directory';
  children?: FileNode[];
  language?: string;
  size?: number;
}

export interface Evaluation {
  score: number;
  isCorrect: boolean;
  feedback: string;
  missedPoints: string[];
  strengths: string[];
  needsHint: boolean;
}

export interface StartInterviewRequest {
  repoUrl: string;
  repoId: string;
}

export interface StartInterviewResponse {
  success: boolean;
  sessionId?: string;
  error?: string;
}

export interface AnalyzeRequest {
  sessionId: string;
  directories?: string[];
}

export interface AnalyzeResponse {
  success: boolean;
  analysis?: RepoAnalysis;
  error?: string;
}

export interface SessionResponse {
  success: boolean;
  session?: InterviewSession;
  error?: string;
}

export interface QuestionRequest {
  sessionId: string;
}

export interface QuestionResponse {
  success: boolean;
  question?: Question;
  message?: ChatMessage;
  error?: string;
}

export interface AnswerRequest {
  sessionId: string;
  answer: string;
  questionId: string;
}

export interface AnswerResponse {
  success: boolean;
  evaluation?: Evaluation;
  message?: ChatMessage;
  codeSnippets?: CodeSnippet[];
  error?: string;
}

export interface HintRequest {
  sessionId: string;
  questionId: string;
}

export interface HintResponse {
  success: boolean;
  hint?: string;
  message?: ChatMessage;
  error?: string;
}

export interface DirectorySelectionRequest {
  sessionId: string;
  directories: string[];
}

export interface DirectorySelectionResponse {
  success: boolean;
  error?: string;
}

export interface RepoFile {
  path: string;
  content: string;
  language: string;
  size: number;
}

export interface FetchedRepo {
  owner: string;
  name: string;
  defaultBranch: string;
  files: RepoFile[];
  structure: FileNode[];
}
