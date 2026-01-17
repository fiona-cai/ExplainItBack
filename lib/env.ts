// Environment variable validation
export function validateEnv() {
  const errors: string[] = []

  if (!process.env.OPENAI_API_KEY) {
    errors.push('OPENAI_API_KEY is required')
  } else if (!process.env.OPENAI_API_KEY.startsWith('sk-')) {
    errors.push('OPENAI_API_KEY appears to be invalid (should start with "sk-")')
  }

  // GITHUB_TOKEN is optional, but if provided, validate format
  if (process.env.GITHUB_TOKEN) {
    // GitHub tokens are typically 40 characters (classic) or start with ghp_/gho_/ghu_/ghs_/ghr_ (fine-grained)
    const token = process.env.GITHUB_TOKEN
    if (token.length < 20) {
      errors.push('GITHUB_TOKEN appears to be invalid (too short)')
    }
  }

  if (errors.length > 0) {
    throw new Error(`Environment validation failed:\n${errors.join('\n')}`)
  }
}

// Validate on module load (for server-side)
if (typeof window === 'undefined') {
  try {
    validateEnv()
  } catch (error) {
    // Only log in development, don't crash in production
    if (process.env.NODE_ENV === 'development') {
      console.error('Environment validation warning:', error)
    }
  }
}
