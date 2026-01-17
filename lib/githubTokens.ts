// GitHub token management and rotation
// Supports multiple tokens for higher rate limits

function getGitHubTokens(): string[] {
  const tokens: string[] = []
  
  // Single token
  if (process.env.GITHUB_TOKEN) {
    tokens.push(process.env.GITHUB_TOKEN)
  }
  
  // Multiple tokens (GITHUB_TOKEN_1, GITHUB_TOKEN_2, etc.)
  let i = 1
  while (process.env[`GITHUB_TOKEN_${i}`]) {
    tokens.push(process.env[`GITHUB_TOKEN_${i}`]!)
    i++
  }
  
  // Log token count in development
  if (process.env.NODE_ENV === 'development' && tokens.length > 0) {
    console.log(`[GitHub Tokens] Loaded ${tokens.length} token(s) for rotation`)
  }
  
  return tokens
}

// Simple round-robin token rotation
let tokenIndex = 0
const tokens = getGitHubTokens()
const tokenUsageCounts = new Map<number, number>()

// Initialize usage tracking
tokens.forEach((_, index) => {
  tokenUsageCounts.set(index, 0)
})

export function getNextGitHubToken(): string | undefined {
  if (tokens.length === 0) {
    return undefined
  }
  
  // Round-robin: cycle through available tokens
  const currentIndex = tokenIndex % tokens.length
  const token = tokens[currentIndex]
  
  // Track usage
  tokenUsageCounts.set(currentIndex, (tokenUsageCounts.get(currentIndex) || 0) + 1)
  tokenIndex++
  
  // Log rotation in development (only first few times to avoid spam)
  if (process.env.NODE_ENV === 'development' && tokenIndex <= 10) {
    console.log(`[GitHub Tokens] Using token ${currentIndex + 1}/${tokens.length} (used ${tokenUsageCounts.get(currentIndex)} times)`)
  }
  
  return token
}

export function hasGitHubToken(): boolean {
  return tokens.length > 0
}

export function getTokenCount(): number {
  return tokens.length
}

export function getTokenUsageStats(): { total: number, perToken: number[] } {
  const perToken = Array.from({ length: tokens.length }, (_, i) => tokenUsageCounts.get(i) || 0)
  const total = perToken.reduce((sum, count) => sum + count, 0)
  return { total, perToken }
}

export function getTokenInfo(): { count: number, tokens: string[] } {
  // Return token count and first 4 chars of each token for verification (safe to log)
  const tokenPreviews = tokens.map(token => {
    if (token.startsWith('ghp_')) {
      return `ghp_${token.substring(4, 8)}...`
    } else if (token.startsWith('github_pat_')) {
      return `github_pat_${token.substring(11, 15)}...`
    }
    return '***'
  })
  return { count: tokens.length, tokens: tokenPreviews }
}
