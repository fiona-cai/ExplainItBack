import { NextRequest, NextResponse } from 'next/server';
import {
  getSession,
  addMessage,
  createMessage,
} from '@/lib/interview/sessionManager';
import { generateHint, formatHintMessage } from '@/lib/interview/hintGenerator';
import type { HintRequest, HintResponse } from '@/types/interview';

export const runtime = 'nodejs';
export const maxDuration = 60;

interface ExtendedHintRequest extends HintRequest {
  hintLevel?: number;
}

export async function POST(request: NextRequest): Promise<NextResponse<HintResponse>> {
  try {
    const body = (await request.json()) as ExtendedHintRequest;
    const { sessionId, questionId, hintLevel = 1 } = body;

    if (!sessionId || !questionId) {
      return NextResponse.json(
        { success: false, error: 'Session ID and question ID are required' },
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

    // Check hint level limit
    const clampedHintLevel = Math.min(Math.max(hintLevel, 1), 3);

    // Generate hint
    const hint = await generateHint(
      session.currentQuestion,
      session.analysisCache,
      clampedHintLevel
    );

    // Format hint message
    const formattedHint = formatHintMessage(hint, clampedHintLevel);

    // Add hint message to chat
    const message = createMessage('assistant', formattedHint, {
      type: 'hint',
      questionId,
    });

    await addMessage(sessionId, message);

    return NextResponse.json({
      success: true,
      hint: formattedHint,
      message,
    });
  } catch (error) {
    console.error('Error generating hint:', error);

    const errorMessage =
      error instanceof Error ? error.message : 'Failed to generate hint';

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
