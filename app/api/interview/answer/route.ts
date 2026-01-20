import { NextRequest, NextResponse } from 'next/server';
import {
  getSession,
  clearCurrentQuestion,
  addMessage,
  createMessage,
} from '@/lib/interview/sessionManager';
import { evaluateAnswer, formatEvaluationMessage } from '@/lib/interview/answerEvaluator';
import { annotateAllSnippets } from '@/lib/interview/codeAnnotator';
import type { AnswerRequest, AnswerResponse } from '@/types/interview';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: NextRequest): Promise<NextResponse<AnswerResponse>> {
  try {
    const body = (await request.json()) as AnswerRequest;
    const { sessionId, answer, questionId } = body;

    if (!sessionId || !answer || !questionId) {
      return NextResponse.json(
        { success: false, error: 'Session ID, answer, and question ID are required' },
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

    if (!session.currentQuestion || session.currentQuestion.id !== questionId) {
      return NextResponse.json(
        { success: false, error: 'Question not found or has changed' },
        { status: 400 }
      );
    }

    if (!session.analysisCache) {
      return NextResponse.json(
        { success: false, error: 'Repository analysis not found' },
        { status: 400 }
      );
    }

    // Add user's answer to chat
    await addMessage(
      sessionId,
      createMessage('user', answer, {
        type: 'answer',
        questionId,
      })
    );

    // Evaluate the answer
    const evaluation = await evaluateAnswer(
      session.currentQuestion,
      answer,
      session.analysisCache
    );

    // Format evaluation message
    const evaluationText = formatEvaluationMessage(
      evaluation,
      session.currentQuestion.text
    );

    // Annotate code snippets with evaluation context
    let codeSnippets = session.currentQuestion.codeSnippets;
    if (codeSnippets.length > 0) {
      codeSnippets = await annotateAllSnippets(codeSnippets, session.currentQuestion);
    }

    // Add evaluation message to chat
    const message = createMessage('assistant', evaluationText, {
      type: 'evaluation',
      questionId,
      score: evaluation.score,
      codeSnippets,
    });

    await addMessage(sessionId, message);

    // Clear current question to prepare for next
    await clearCurrentQuestion(sessionId);

    return NextResponse.json({
      success: true,
      evaluation,
      message,
      codeSnippets,
    });
  } catch (error) {
    console.error('Error evaluating answer:', error);

    const errorMessage =
      error instanceof Error ? error.message : 'Failed to evaluate answer';

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
