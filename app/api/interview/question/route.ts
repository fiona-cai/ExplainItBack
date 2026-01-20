import { NextRequest, NextResponse } from 'next/server';
import {
  getSession,
  setCurrentQuestion,
  addMessage,
  createMessage,
} from '@/lib/interview/sessionManager';
import { generateQuestion } from '@/lib/interview/questionGenerator';
import { annotateAllSnippets } from '@/lib/interview/codeAnnotator';
import type { QuestionRequest, QuestionResponse } from '@/types/interview';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: NextRequest): Promise<NextResponse<QuestionResponse>> {
  try {
    const body = (await request.json()) as QuestionRequest;
    const { sessionId } = body;

    if (!sessionId) {
      return NextResponse.json(
        { success: false, error: 'Session ID is required' },
        { status: 400 }
      );
    }

    const session = await getSession(sessionId);

    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Session not found' },
        { status: 404 }
      );
    }

    if (!session.analysisCache) {
      return NextResponse.json(
        { success: false, error: 'Repository analysis not found. Please analyze the repository first.' },
        { status: 400 }
      );
    }

    if (session.status === 'ended') {
      return NextResponse.json(
        { success: false, error: 'Session has ended' },
        { status: 400 }
      );
    }

    // Generate a new question
    const question = await generateQuestion(
      session.analysisCache,
      session.questionsAsked
    );

    // Annotate code snippets
    if (question.codeSnippets.length > 0) {
      question.codeSnippets = await annotateAllSnippets(
        question.codeSnippets,
        question
      );
    }

    // Update session with the new question
    await setCurrentQuestion(sessionId, question);

    // Add question message to chat
    const message = createMessage('assistant', question.text, {
      type: 'question',
      questionId: question.id,
      codeSnippets: question.codeSnippets,
    });

    await addMessage(sessionId, message);

    return NextResponse.json({
      success: true,
      question,
      message,
    });
  } catch (error) {
    console.error('Error generating question:', error);

    const errorMessage =
      error instanceof Error ? error.message : 'Failed to generate question';

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
