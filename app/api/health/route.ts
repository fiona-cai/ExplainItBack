import { NextResponse } from 'next/server'
import { hasGitHubToken, getTokenCount, getTokenInfo, getTokenUsageStats } from '@/lib/githubTokens'

export async function GET() {
  try {
    const tokenInfo = getTokenInfo()
    const usageStats = getTokenUsageStats()
    const hasToken = hasGitHubToken()
    
    return NextResponse.json({
      status: 'ok',
      github: {
        tokensConfigured: hasToken,
        tokenCount: getTokenCount(),
        tokenInfo: tokenInfo,
        usage: usageStats,
        effectiveRateLimit: hasToken ? Math.min(100 * getTokenCount(), 500) : 60,
      },
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    return NextResponse.json(
      { status: 'error', error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
