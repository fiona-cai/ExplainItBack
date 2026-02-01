import { NextRequest, NextResponse } from 'next/server';
import {
  getSession,
  setAnalysisCache,
  updateSessionStatus,
  addMessage,
  createMessage,
} from '@/lib/interview/sessionManager';
import { fetchRepository } from '@/lib/interview/githubFetcher';
import { analyzeRepository } from '@/lib/interview/repoAnalyzer';
import type { AnalyzeRequest, AnalyzeResponse } from '@/types/interview';

export const runtime = 'nodejs';
export const maxDuration = 120; // Analysis can take longer

export async function POST(request: NextRequest): Promise<NextResponse<AnalyzeResponse>> {
  try {
    const body = (await request.json()) as AnalyzeRequest;
    const { sessionId, directories } = body;

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

    // Add analyzing message
    await addMessage(
      sessionId,
      createMessage(
        'assistant',
        `Analyzing the repository${directories && directories.length > 0 ? ` (focusing on: ${directories.join(', ')})` : ' (entire repo)'}...\n\nThis may take a moment. I'll generate a challenging question once the analysis is complete.`,
        { type: 'system' }
      )
    );

    // Fetch repository contents
    const repo = await fetchRepository(session.repoUrl, directories);

    if (repo.files.length === 0) {
      await updateSessionStatus(sessionId, 'selecting_dirs');
      return NextResponse.json(
        { success: false, error: 'No files found in the repository or selected directories' },
        { status: 400 }
      );
    }

    // Analyze the repository with GPT-4
    const analysis = await analyzeRepository(repo);

    // Cache the analysis in the session
    await setAnalysisCache(sessionId, analysis);

    // Add success message
    await addMessage(
      sessionId,
      createMessage(
        'assistant',
        `Analysis complete! I've analyzed ${repo.files.length} files and identified the key patterns and architecture.\n\n**Summary:**\n${analysis.summary.slice(0, 500)}...\n\nLet me generate your first question...`,
        { type: 'system' }
      )
    );

    return NextResponse.json({
      success: true,
      analysis,
    });
  } catch (error) {
    console.error('Error analyzing repository:', error);

    const errorMessage =
      error instanceof Error ? error.message : 'Failed to analyze repository';

    // Revert status so user is not stuck on "analyzing" and can try again
    try {
      const body = (await request.clone().json()) as AnalyzeRequest;
      if (body?.sessionId) {
        await updateSessionStatus(body.sessionId, 'selecting_dirs');
      }
    } catch (revertError) {
      console.error('Failed to revert session status:', revertError);
    }

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
