import { v4 as uuidv4 } from 'uuid';
import { redis, RedisClient } from '@/lib/redis';
import type { InterviewSession, ChatMessage, Question, RepoAnalysis } from '@/types/interview';

const SESSION_PREFIX = 'interview:session:';
const SESSION_TTL = 60 * 60 * 24; // 24 hours in seconds

// Ensure Redis is connected before operations
async function ensureRedisConnected(): Promise<void> {
  try {
    await RedisClient.connect();
  } catch (error) {
    // If already connected, ignore the error
    const errorMessage = (error as Error).message;
    if (errorMessage !== 'Redis is already connecting/connected') {
      throw error;
    }
  }
}

export async function createSession(repoUrl: string, repoId: string): Promise<InterviewSession> {
  const sessionId = uuidv4();
  const now = Date.now();

  const welcomeMessage: ChatMessage = {
    id: uuidv4(),
    role: 'assistant',
    content: `Welcome to Interview Mode! I'll test your understanding of this repository with challenging technical questions.

Before we begin, would you like to:
1. **Focus on specific directories** - Type the directory paths (e.g., "src/api, lib/utils")
2. **Use the entire repository** - Type "entire repo" or "all"

What would you like to focus on?`,
    timestamp: now,
    metadata: {
      type: 'system',
    },
  };

  const session: InterviewSession = {
    sessionId,
    repoUrl,
    repoId,
    selectedDirectories: [],
    messages: [welcomeMessage],
    currentQuestion: null,
    questionsAsked: [],
    analysisCache: null,
    createdAt: now,
    lastActivity: now,
    status: 'selecting_dirs',
  };

  await saveSession(session);
  return session;
}

export async function getSession(sessionId: string): Promise<InterviewSession | null> {
  try {
    await ensureRedisConnected();
    const key = `${SESSION_PREFIX}${sessionId}`;
    const data = await redis.get(key);
    
    if (process.env.NODE_ENV === 'development') {
      console.log(`Getting session: ${sessionId}, found: ${!!data}`);
    }
    
    if (!data) return null;
    return JSON.parse(data) as InterviewSession;
  } catch (error) {
    console.error('Error getting session:', error);
    return null;
  }
}

export async function saveSession(session: InterviewSession): Promise<void> {
  try {
    await ensureRedisConnected();
    session.lastActivity = Date.now();
    const key = `${SESSION_PREFIX}${session.sessionId}`;
    const value = JSON.stringify(session);
    
    await redis.setex(key, SESSION_TTL, value);
    
    // Debug: verify the session was saved
    if (process.env.NODE_ENV === 'development') {
      const saved = await redis.get(key);
      if (!saved) {
        console.error('Session save verification failed: session was not found after saving');
      } else {
        console.log(`Session saved successfully: ${session.sessionId}`);
      }
    }
  } catch (error) {
    console.error('Error saving session:', error);
    throw error;
  }
}

export async function deleteSession(sessionId: string): Promise<boolean> {
  try {
    await ensureRedisConnected();
    const result = await redis.del(`${SESSION_PREFIX}${sessionId}`);
    return result > 0;
  } catch (error) {
    console.error('Error deleting session:', error);
    return false;
  }
}

export async function addMessage(sessionId: string, message: ChatMessage): Promise<InterviewSession | null> {
  const session = await getSession(sessionId);
  if (!session) return null;

  session.messages.push(message);
  await saveSession(session);
  return session;
}

export async function updateSessionStatus(
  sessionId: string,
  status: InterviewSession['status']
): Promise<InterviewSession | null> {
  const session = await getSession(sessionId);
  if (!session) return null;

  session.status = status;
  await saveSession(session);
  return session;
}

export async function setSelectedDirectories(
  sessionId: string,
  directories: string[]
): Promise<InterviewSession | null> {
  const session = await getSession(sessionId);
  if (!session) return null;

  session.selectedDirectories = directories;
  session.status = 'analyzing';
  await saveSession(session);
  return session;
}

export async function setAnalysisCache(
  sessionId: string,
  analysis: RepoAnalysis
): Promise<InterviewSession | null> {
  const session = await getSession(sessionId);
  if (!session) return null;

  session.analysisCache = analysis;
  session.status = 'active';
  await saveSession(session);
  return session;
}

export async function setCurrentQuestion(
  sessionId: string,
  question: Question
): Promise<InterviewSession | null> {
  const session = await getSession(sessionId);
  if (!session) return null;

  session.currentQuestion = question;
  session.questionsAsked.push(question.id);
  await saveSession(session);
  return session;
}

export async function clearCurrentQuestion(sessionId: string): Promise<InterviewSession | null> {
  const session = await getSession(sessionId);
  if (!session) return null;

  session.currentQuestion = null;
  await saveSession(session);
  return session;
}

export async function endSession(sessionId: string): Promise<InterviewSession | null> {
  const session = await getSession(sessionId);
  if (!session) return null;

  const endMessage: ChatMessage = {
    id: uuidv4(),
    role: 'assistant',
    content: `Interview session ended. You answered ${session.questionsAsked.length} questions. Thanks for practicing!`,
    timestamp: Date.now(),
    metadata: {
      type: 'system',
    },
  };

  session.messages.push(endMessage);
  session.status = 'ended';
  session.currentQuestion = null;
  await saveSession(session);
  return session;
}

export function createMessage(
  role: ChatMessage['role'],
  content: string,
  metadata?: ChatMessage['metadata']
): ChatMessage {
  return {
    id: uuidv4(),
    role,
    content,
    timestamp: Date.now(),
    metadata,
  };
}
