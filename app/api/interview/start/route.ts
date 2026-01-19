import { NextRequest, NextResponse } from 'next/server';
import { createSession } from '@/lib/interview/sessionManager';
import type { StartInterviewRequest, StartInterviewResponse } from '@/types/interview';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: NextRequest): Promise<NextResponse<StartInterviewResponse>> {
  try {
    const body = (await request.json()) as StartInterviewRequest;
    const { repoUrl, repoId } = body;

    if (!repoUrl) {
      return NextResponse.json(
        { success: false, error: 'Repository URL is required' },
        { status: 400 }
      );
    }

    // Validate GitHub URL format
    try {
      const url = new URL(repoUrl);
      if (url.hostname !== 'github.com' && url.hostname !== 'www.github.com') {
        return NextResponse.json(
          { success: false, error: 'Invalid GitHub URL' },
          { status: 400 }
        );
      }
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid URL format' },
        { status: 400 }
      );
    }

    // Create a new interview session
    const session = await createSession(repoUrl, repoId || repoUrl);

    return NextResponse.json({
      success: true,
      sessionId: session.sessionId,
    });
  } catch (error) {
    console.error('Error starting interview:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to start interview session' },
      { status: 500 }
    );
  }
}
