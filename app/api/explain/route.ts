import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { Octokit } from '@octokit/rest'
import JSZip from 'jszip'
import { validateEnv } from '@/lib/env'
import { checkRateLimit, getClientIdentifier } from '@/lib/rateLimit'
import { retryWithBackoff } from '@/lib/retry'
import { getNextGitHubToken, hasGitHubToken, getTokenCount, getTokenUsageStats } from '@/lib/githubTokens'

// Configure route for larger file uploads
export const runtime = 'nodejs'
export const maxDuration = 60

// Validate environment variables on module load
try {
  validateEnv()
} catch (error) {
  console.error('Environment validation failed:', error)
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

// Token estimation: ~4 characters = 1 token (rough estimate)
// OpenAI context window: 128K tokens total
// Breakdown:
//   - System prompt: ~150 tokens
//   - User prompt template: ~600 tokens
//   - Output buffer: ~5,000 tokens
//   - Available for project description: ~122,000 tokens = ~488,000 characters
// We'll dynamically read until we approach the limit
const TOKENS_PER_CHAR = 0.25 // ~4 characters per token
const SYSTEM_PROMPT_TOKENS = 150
const USER_PROMPT_TEMPLATE_TOKENS = 600
const OUTPUT_BUFFER_TOKENS = 5000
const MAX_CONTEXT_TOKENS = 128000
const MAX_PROJECT_TOKENS = MAX_CONTEXT_TOKENS - SYSTEM_PROMPT_TOKENS - USER_PROMPT_TEMPLATE_TOKENS - OUTPUT_BUFFER_TOKENS
const MAX_PROJECT_CHARACTERS = Math.floor(MAX_PROJECT_TOKENS / TOKENS_PER_CHAR) // ~488,000 characters
const WARNING_THRESHOLD_TOKENS = MAX_PROJECT_TOKENS * 0.75 // Warn at 75% of limit
const WARNING_THRESHOLD_CHARACTERS = Math.floor(WARNING_THRESHOLD_TOKENS / TOKENS_PER_CHAR) // ~366,000 characters

interface RequestBody {
  projectDescription?: string
  audience?: 'recruiter' | 'engineer' | 'hiring-manager' | 'founder-product'
  tone?: 'confident' | 'concise' | 'conversational' | 'technical'
  inputMethod?: 'text' | 'github' | 'upload'
}

// Parse GitHub URL to extract owner and repo
function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  try {
    const urlObj = new URL(url)
    if (urlObj.hostname !== 'github.com' && urlObj.hostname !== 'www.github.com') {
      return null
    }
    const parts = urlObj.pathname.split('/').filter(Boolean)
    if (parts.length >= 2) {
      return { owner: parts[0], repo: parts[1].replace(/\.git$/, '') }
    }
    return null
  } catch {
    return null
  }
}

// Calculate tokens from text
function estimateTokens(text: string): number {
  return Math.ceil(text.length * TOKENS_PER_CHAR)
}

// Recursively fetch all files from a directory in the repository
// Stops when approaching token limit
async function fetchDirectoryContents(
  octokit: Octokit,
  owner: string,
  repo: string,
  path: string = '',
  maxFileSize: number = 100000, // 100KB per file
  excludeDirs: string[] = ['node_modules', '.git', 'dist', 'build', '.next', 'venv', '__pycache__', '.venv', 'target', 'bin', 'obj'],
  onProgress?: (filesFetched: number, totalTokens: number) => void,
  currentTokens: number = 0
): Promise<{ files: Map<string, string>, totalTokens: number, filesFetched: number, stoppedEarly: boolean }> {
  const files = new Map<string, string>()
  let totalTokens = currentTokens
  let filesFetched = 0
  let stoppedEarly = false

  async function traverse(currentPath: string): Promise<void> {
    if (stoppedEarly) return
    
    // Skip excluded directories
    const pathParts = currentPath.split('/').filter(Boolean)
    if (pathParts.some(part => excludeDirs.includes(part))) {
      return
    }

    try {
      const { data } = await octokit.repos.getContent({
        owner,
        repo,
        path: currentPath || '',
      })

      if (Array.isArray(data)) {
        // It's a directory
        for (const item of data) {
          if (stoppedEarly) break
          
          if (item.type === 'file') {
            // Skip binary files and large files
            if (item.size && item.size > maxFileSize) {
              continue
            }

            // Check if we're approaching token limit
            if (totalTokens >= MAX_PROJECT_TOKENS * 0.95) {
              stoppedEarly = true
              break
            }

            // Skip binary file extensions
            const binaryExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.eot', '.pdf', '.zip', '.tar', '.gz', '.exe', '.dll', '.so', '.dylib']
            const isBinary = binaryExtensions.some(ext => item.name.toLowerCase().endsWith(ext))
            if (isBinary) {
              continue
            }

            try {
              const fileData = await octokit.repos.getContent({
                owner,
                repo,
                path: item.path,
              })
              
              if ('content' in fileData.data && fileData.data.content) {
                const content = Buffer.from(fileData.data.content, 'base64').toString('utf-8')
                const fileTokens = estimateTokens(content)
                
                // Check if adding this file would exceed the limit
                if (totalTokens + fileTokens > MAX_PROJECT_TOKENS * 0.95) {
                  stoppedEarly = true
                  break
                }
                
                files.set(item.path, content)
                totalTokens += fileTokens
                filesFetched++
                if (onProgress) {
                  onProgress(filesFetched, totalTokens)
                }
              }
            } catch {
              // Skip files that can't be read
            }
          } else if (item.type === 'dir') {
            await traverse(item.path)
          }
        }
      } else if (data.type === 'file') {
        if (stoppedEarly) return
        
        // Single file
        if (data.size && data.size <= maxFileSize) {
          // Check token limit
          if (totalTokens >= MAX_PROJECT_TOKENS * 0.95) {
            stoppedEarly = true
            return
          }

          const binaryExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.eot', '.pdf', '.zip', '.tar', '.gz', '.exe', '.dll', '.so', '.dylib']
          const isBinary = binaryExtensions.some(ext => data.name.toLowerCase().endsWith(ext))
          
          if (!isBinary && 'content' in data && data.content) {
            const content = Buffer.from(data.content, 'base64').toString('utf-8')
            const fileTokens = estimateTokens(content)
            
            if (totalTokens + fileTokens > MAX_PROJECT_TOKENS * 0.95) {
              stoppedEarly = true
              return
            }
            
            files.set(data.path, content)
            totalTokens += fileTokens
            filesFetched++
            if (onProgress) {
              onProgress(filesFetched, totalTokens)
            }
          }
        }
      }
    } catch (error: any) {
      // Skip directories/files that can't be accessed
      if (error.status !== 404) {
        console.warn(`Failed to fetch ${currentPath}:`, error.message)
      }
    }
  }

  await traverse(path)
  return { files, totalTokens, filesFetched, stoppedEarly }
}

// Fetch repository information from GitHub
async function fetchGitHubRepoInfo(
  owner: string, 
  repo: string,
  onProgress?: (filesFetched: number, totalTokens: number) => void
): Promise<{ description: string, rateLimit?: { remaining: number, reset: number } }> {
  // Use token rotation if multiple tokens are available
  const token = getNextGitHubToken()
  const octokit = new Octokit({
    auth: token, // Optional: can work without auth for public repos
  })

  try {
    // Fetch repository details with retry
    const { data: repoData } = await retryWithBackoff(async () => {
      return await octokit.repos.get({ owner, repo })
    }, {
      retryableErrors: (error: any) => {
        return error?.status === 429 || error?.status >= 500
      }
    })

    // Fetch README if available with retry
    let readmeContent = ''
    try {
      const { data: readmeData } = await retryWithBackoff(async () => {
        return await octokit.repos.getReadme({ owner, repo })
      }, {
        retryableErrors: (error: any) => {
          return error?.status === 429 || error?.status >= 500
        }
      })
      if (readmeData.content) {
        readmeContent = Buffer.from(readmeData.content, 'base64').toString('utf-8')
      }
    } catch {
      // README might not exist, continue without it
    }

    // Get rate limit info
    const rateLimitResponse = await octokit.rateLimit.get()
    const rateLimit = {
      remaining: rateLimitResponse.data.rate.remaining,
      reset: rateLimitResponse.data.rate.reset * 1000, // Convert to milliseconds
    }

    // Start with README tokens
    let currentTokens = estimateTokens(readmeContent)

    // Recursively fetch all repository files until token limit
    const { files, totalTokens, filesFetched, stoppedEarly } = await fetchDirectoryContents(
      octokit, 
      owner, 
      repo, 
      '', 
      100000, 
      ['node_modules', '.git', 'dist', 'build', '.next', 'venv', '__pycache__', '.venv', 'target', 'bin', 'obj'], 
      onProgress,
      currentTokens
    )

    // Build project description from fetched data
    let description = `Repository: ${owner}/${repo}\n`
    description += `Description: ${repoData.description || 'No description provided'}\n`
    description += `Language: ${repoData.language || 'Not specified'}\n`
    description += `Stars: ${repoData.stargazers_count}\n`
    description += `Forks: ${repoData.forks_count}\n`
    description += `Files analyzed: ${filesFetched}\n`
    description += `Tokens used: ~${totalTokens.toLocaleString()} / ${MAX_PROJECT_TOKENS.toLocaleString()}\n`
    if (stoppedEarly) {
      description += `Note: Reading stopped at ~95% of token limit to ensure room for output.\n`
    }
    description += `\n`

    if (readmeContent) {
      description += `=== README ===\n${readmeContent}\n\n`
    }

    // Add all fetched files
    const sortedFiles = Array.from(files.entries()).sort((a, b) => a[0].localeCompare(b[0]))
    for (const [filePath, content] of sortedFiles) {
      // Skip README since we already added it above
      if (filePath.toLowerCase().includes('readme')) {
        continue
      }
      description += `=== ${filePath} ===\n${content}\n\n`
    }

    return { description, rateLimit }
  } catch (error: any) {
    if (error.status === 404) {
      throw new Error('Repository not found. Please check the URL and ensure the repository is public.')
    }
    if (error.status === 403) {
      // Check if it's a rate limit error
      const rateLimitRemaining = error.response?.headers?.['x-ratelimit-remaining']
      const rateLimitReset = error.response?.headers?.['x-ratelimit-reset']
      if (rateLimitRemaining === '0' || error.message?.includes('rate limit')) {
        const resetTime = rateLimitReset ? new Date(parseInt(rateLimitReset) * 1000).toLocaleString() : 'soon'
        throw new Error(`GitHub API rate limit exceeded. Please try again after ${resetTime}. Consider adding a GITHUB_TOKEN for higher limits.`)
      }
      throw new Error('Access forbidden. The repository may be private or you may have exceeded your API rate limit.')
    }
    if (error.status === 429) {
      throw new Error('GitHub API rate limit exceeded. Please wait a moment and try again.')
    }
    throw new Error(`Failed to fetch repository: ${error.message || 'Unknown error'}`)
  }
}

// Extract project information from uploaded file
async function extractProjectInfoFromFile(file: File): Promise<string> {
  const fileExtension = file.name.split('.').pop()?.toLowerCase()
  
  if (fileExtension === 'zip') {
    return extractFromZip(file)
  } else {
    throw new Error('Unsupported file format. Please upload a ZIP file.')
  }
}

// Extract project information from ZIP file
async function extractFromZip(file: File): Promise<string> {
  try {
    const arrayBuffer = await file.arrayBuffer()
    const zip = await JSZip.loadAsync(arrayBuffer)
    
    let description = `Project files from: ${file.name}\n\n`
    
    // Look for key files
    const keyFiles = [
      'README.md', 'README.txt', 'README',
      'package.json', 'requirements.txt', 'Pipfile',
      'Cargo.toml', 'go.mod', 'pom.xml', 'build.gradle',
      'setup.py', 'pyproject.toml',
    ]
    
    const foundFiles: string[] = []
    
    // Extract content from key files
    for (const fileName of keyFiles) {
      // Search for files matching the name (case-insensitive, can be in subdirectories)
      const regex = new RegExp(`(^|/)${fileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')
      let matchingPath: string | null = null
      for (const relativePath of Object.keys(zip.files)) {
        if (regex.test(relativePath) && !relativePath.endsWith('/')) {
          matchingPath = relativePath
          break
        }
      }
      if (matchingPath) {
        const matchingFile = zip.file(matchingPath)
        if (matchingFile) {
          foundFiles.push(fileName)
          try {
            const content = await (matchingFile as JSZip.JSZipObject).async('string')
            description += `--- ${matchingFile.name} ---\n${content}\n\n`
          } catch {
            // Skip if can't read as string (binary file)
          }
        }
      }
    }
    
    // If no key files found, list all files
    if (foundFiles.length === 0) {
      description += 'Files in project:\n'
      const allFiles: string[] = []
      zip.forEach((relativePath) => {
        if (!relativePath.endsWith('/')) {
          allFiles.push(relativePath)
          description += `- ${relativePath}\n`
        }
      })
      description += '\n'
      
      // Try to get content from first few text files
      let fileCount = 0
      for (const relativePath of allFiles) {
        if (fileCount >= 5) break
        const file = zip.file(relativePath)
        if (file) {
          try {
            const content = await file.async('string')
            if (content.length < 5000) { // Only include smaller files
              description += `--- ${relativePath} ---\n${content.substring(0, 2000)}...\n\n`
              fileCount++
            }
          } catch {
            // Skip binary files
          }
        }
      }
    }
    
    return description
  } catch (error: any) {
    throw new Error(`Failed to extract project information: ${error.message}`)
  }
}

// Generate explanation using OpenAI
async function generateExplanation(
  projectDescription: string,
  audience: 'recruiter' | 'engineer' | 'hiring-manager' | 'founder-product',
  tone: 'confident' | 'concise' | 'conversational' | 'technical'
) {
  const systemPrompt = `You are an expert technical communicator specializing in translating complex project descriptions into clear, accurate explanations for different audiences. Your role is to:
- Preserve technical accuracy without inventing features
- Use concrete mechanisms and specific technologies over vague buzzwords
- Adapt language and depth based on the target audience
- Generate precise, actionable outputs that reflect only what is stated in the input

You never hallucinate features, technologies, or capabilities that aren't explicitly mentioned in the project description.`

  const userPrompt = `Project Description:
${projectDescription}

Target Audience: ${audience}
Tone: ${tone}

Generate three outputs based on the project description above. IMPORTANT: Vary your language to avoid repetition. When mentioning technologies or components multiple times, use varied phrasing (e.g., "the system", "the backend", "the frontend", "the application" instead of repeating full stack names).

1. Technical Explanation (5-7 sentences):
   - Explain what the project does and how it works
   - Use concrete technical details from the description
   - Avoid generic statements, buzzwords, or repetitive phrasing
   - Match the technical depth to the audience (${audience})
   - Use a ${tone} tone
   - Vary your language: if you mention a technology once, refer to it differently later (e.g., "React frontend" → "the UI", "FastAPI backend" → "the API layer")

2. Resume Bullets (exactly 2–3 bullets; output as a JSON array):
   - Each bullet must start with a strong action verb (Built, Created, Developed, Designed, Implemented, etc.)
   - Lead with outcome and impact, then mention the approach: "Built [what] enabling [outcome/impact] via [approach], using [technologies]"
   - Make bullets punchy and senior-level: foreground innovation, AI/ML features, scale, or unique capabilities
   - Keep bullets concise (typically one line, max two lines) but impactful
   - Focus on what was achieved and how it's valuable, not just what was built
   - Each bullet should highlight a distinct aspect (e.g., frontend, backend, integration, or specific feature)
   - Example format: "Built a web-based music production platform enabling AI-assisted music creation via natural-language prompts, using TypeScript, React, and FastAPI."
   - Vary technology mentions across bullets to avoid repetition
   - Only include information explicitly stated in the project description.

3. Interview Pitch (30-second spoken format):
   - Natural, conversational language suitable for speaking
   - Highlight the problem solved and your approach
   - Mention 1-2 key technical decisions or features
   - End with the impact or outcome
   - Should take approximately 30 seconds to read aloud
   - Use varied phrasing to avoid repeating the same technical terms

CRITICAL CONSTRAINTS:
- Only include information explicitly stated in the project description
- Do not invent features, technologies, or capabilities
- If specific technologies aren't mentioned, use general but accurate terms
- Maintain technical accuracy while adapting to audience level
- VARY YOUR LANGUAGE: Avoid repeating the same phrases, stack names, or technical terms. Use synonyms and varied references.

Return your response as a JSON object with exactly these fields:
{
  "technicalExplanation": "...",
  "resumeBullets": ["first bullet text", "second bullet text", "optional third bullet"],
  "interviewPitch": "..."
}

resumeBullets must be an array of exactly 2 or 3 strings. Do not include bullet characters (• or -) in the text.`

  // Validate input length based on token estimation
  const inputLength = projectDescription.length
  const estimatedTokens = estimateTokens(projectDescription)
  
  if (estimatedTokens > MAX_PROJECT_TOKENS) {
    throw new Error(`Input is too long (${inputLength.toLocaleString()} characters, ~${estimatedTokens.toLocaleString()} tokens). Maximum allowed is ~${MAX_PROJECT_TOKENS.toLocaleString()} tokens (~${MAX_PROJECT_CHARACTERS.toLocaleString()} characters). Please reduce the size of your project description.`)
  }

  const completion = await retryWithBackoff(async () => {
    return await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
    })
  }, {
    retryableErrors: (error: any) => {
      // Retry on rate limits and server errors
      if (error?.status === 429 || error?.status >= 500) {
        return true
      }
      if (error?.message?.includes('rate limit') || error?.message?.includes('timeout')) {
        return true
      }
      return false
    }
  })

  const content = completion.choices[0]?.message?.content
  if (!content) {
    throw new Error('No response from OpenAI')
  }

  const result = JSON.parse(content)

  // Validate the response structure
  if (!result.technicalExplanation || !result.interviewPitch) {
    throw new Error('Invalid response format from OpenAI')
  }
  const bullets = result.resumeBullets
  if (!Array.isArray(bullets) || bullets.length < 2) {
    throw new Error('Invalid response format from OpenAI: resumeBullets must be an array of 2 or 3 strings')
  }
  result.resumeBullets = bullets.slice(0, 3).map((b: unknown) => (typeof b === 'string' ? b : String(b)))

  return result
}

export async function POST(request: NextRequest) {
  try {
    // Rate limiting: Configurable per-user and global limits
    // Per-user limit: Prevents abuse from individual users
    // Global limit: Handles total traffic volume
    const clientId = getClientIdentifier(request)
    const hasToken = hasGitHubToken()
    const tokenCount = getTokenCount()
    
    // Per-user rate limit (per IP): Allow 3 requests per 30 minutes per user
    // This allows users to process multiple projects and retry if needed
    const PER_USER_LIMIT = parseInt(process.env.RATE_LIMIT_PER_USER || '3', 10)
    
    // Global rate limit calculation:
    // - Without token: 60/hour (GitHub's unauthenticated limit)
    // - With tokens: Scale based on expected traffic
    // For 500 users/hour: need ~1000-1500 requests/hour capacity
    // With 4 tokens: GitHub can handle 20,000/hour, so we're safe
    const EXPECTED_USERS_PER_HOUR = parseInt(process.env.EXPECTED_USERS_PER_HOUR || '500', 10)
    const REQUESTS_PER_USER = parseFloat(process.env.AVG_REQUESTS_PER_USER || '2.0') // Average requests per user
    const BURST_FACTOR = parseFloat(process.env.BURST_FACTOR || '1.5') // Allow 50% burst traffic
    
    const calculatedGlobalLimit = Math.ceil(EXPECTED_USERS_PER_HOUR * REQUESTS_PER_USER * BURST_FACTOR)
    const maxGlobalRequests = hasToken 
      ? Math.max(calculatedGlobalLimit, 100 * tokenCount) // At least 100 per token
      : 60
    
    // Check per-user limit first (3 requests per 30 minutes)
    const userRateLimit = checkRateLimit(`user:${clientId}`, PER_USER_LIMIT, 30 * 60 * 1000)
    if (!userRateLimit.allowed) {
      const resetDate = new Date(userRateLimit.resetTime).toLocaleTimeString()
      return NextResponse.json(
        { 
          error: `Rate limit exceeded. You've used ${PER_USER_LIMIT} requests this hour. Please try again after ${resetDate}.`,
          rateLimit: {
            remaining: 0,
            resetTime: userRateLimit.resetTime,
            limit: PER_USER_LIMIT,
            type: 'per-user',
          }
        },
        { 
          status: 429,
          headers: {
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': userRateLimit.resetTime.toString(),
            'X-RateLimit-Limit': PER_USER_LIMIT.toString(),
          }
        }
      )
    }
    
    // Check global rate limit (using a shared identifier)
    const globalRateLimit = checkRateLimit('global', maxGlobalRequests, 60 * 60 * 1000)
    if (!globalRateLimit.allowed) {
      const resetDate = new Date(globalRateLimit.resetTime).toLocaleTimeString()
      return NextResponse.json(
        { 
          error: `Service is currently at capacity. Please try again after ${resetDate}.`,
          rateLimit: {
            remaining: 0,
            resetTime: globalRateLimit.resetTime,
            limit: maxGlobalRequests,
            type: 'global',
          }
        },
        { 
          status: 429,
          headers: {
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': globalRateLimit.resetTime.toString(),
            'X-RateLimit-Limit': maxGlobalRequests.toString(),
          }
        }
      )
    }
    
    // Use user rate limit for response (more relevant to the user)
    const rateLimit = userRateLimit
    
    if (!rateLimit.allowed) {
      const resetDate = new Date(rateLimit.resetTime).toLocaleTimeString()
      return NextResponse.json(
        { 
          error: `Rate limit exceeded. Please try again after ${resetDate}.`,
          rateLimit: {
            remaining: 0,
            resetTime: rateLimit.resetTime,
          }
        },
        { 
          status: 429,
          headers: {
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': rateLimit.resetTime.toString(),
          }
        }
      )
    }

    const contentType = request.headers.get('content-type') || ''
    
    let projectDescription = ''
    let audience: 'recruiter' | 'engineer' | 'hiring-manager' | 'founder-product' = 'engineer'
    let tone: 'confident' | 'concise' | 'conversational' | 'technical' = 'confident'
    let inputMethod: 'text' | 'github' | 'upload' = 'text'
    let githubRateLimit: { remaining: number, reset: number } | undefined

    // Handle file upload (FormData)
    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData()
      const file = formData.get('file') as File | null
      const audienceStr = formData.get('audience') as string
      const toneStr = formData.get('tone') as string
      const inputMethodStr = formData.get('inputMethod') as string

      if (!file) {
        return NextResponse.json(
          { error: 'File is required' },
          { status: 400 }
        )
      }

      if (file.size > 50 * 1024 * 1024) { // 50MB limit
        return NextResponse.json(
          { error: 'File size exceeds 50MB limit' },
          { status: 400 }
        )
      }

      audience = (audienceStr as 'recruiter' | 'engineer' | 'hiring-manager' | 'founder-product') || 'engineer'
      tone = (toneStr as 'confident' | 'concise' | 'conversational' | 'technical') || 'confident'
      inputMethod = (inputMethodStr as typeof inputMethod) || 'upload'

      projectDescription = await extractProjectInfoFromFile(file)
    } else {
      // Handle JSON request
      const body: RequestBody = await request.json()
      const { projectDescription: inputDescription, audience: inputAudience, tone: inputTone, inputMethod: inputMethodType } = body

      audience = inputAudience || 'engineer'
      tone = inputTone || 'confident'
      inputMethod = inputMethodType || 'text'

      if (!inputDescription || inputDescription.trim().length === 0) {
        return NextResponse.json(
          { error: 'Project description or GitHub URL is required' },
          { status: 400 }
        )
      }

      // Handle GitHub URL
      if (inputMethod === 'github') {
        const repoInfo = parseGitHubUrl(inputDescription)
        if (!repoInfo) {
          return NextResponse.json(
            { error: 'Invalid GitHub URL. Please provide a valid GitHub repository URL.' },
            { status: 400 }
          )
        }
        
        // Check GitHub rate limit before fetching (to give better error messages)
        const token = getNextGitHubToken()
        const octokit = new Octokit({
          auth: token,
        })
        try {
          const rateLimitCheck = await octokit.rateLimit.get()
          const remaining = rateLimitCheck.data.rate.remaining
          if (remaining < 5) {
            const resetTime = new Date(rateLimitCheck.data.rate.reset * 1000).toLocaleString()
            return NextResponse.json(
              { 
                error: `GitHub API rate limit is very low (${remaining} remaining). Please wait until ${resetTime} or add a GITHUB_TOKEN for higher limits.`,
                githubRateLimit: {
                  remaining,
                  reset: rateLimitCheck.data.rate.reset * 1000,
                }
              },
              { status: 429 }
            )
          }
        } catch {
          // If we can't check rate limit, continue anyway
        }
        
        const result = await fetchGitHubRepoInfo(repoInfo.owner, repoInfo.repo)
        projectDescription = result.description
        githubRateLimit = result.rateLimit
      } else {
        // Handle text input
        projectDescription = inputDescription
      }
    }

    if (!projectDescription || projectDescription.trim().length === 0) {
      return NextResponse.json(
        { error: 'Failed to extract project information' },
        { status: 400 }
      )
    }

    // Validate input length based on token estimation
    const inputLength = projectDescription.length
    const estimatedTokens = estimateTokens(projectDescription)
    
    if (estimatedTokens > MAX_PROJECT_TOKENS) {
      return NextResponse.json(
        { 
          error: `Input is too long (${inputLength.toLocaleString()} characters, ~${estimatedTokens.toLocaleString()} tokens). Maximum allowed is ~${MAX_PROJECT_TOKENS.toLocaleString()} tokens (~${MAX_PROJECT_CHARACTERS.toLocaleString()} characters). Please reduce the size of your project description.`,
          inputLength,
          estimatedTokens,
        },
        { status: 400 }
      )
    }

    const result = await generateExplanation(projectDescription, audience, tone)
    
    // Include rate limit info in response
    const tokenUsage = getTokenUsageStats()
    const response: any = {
      ...result,
      metadata: {
        inputLength,
        estimatedTokens,
        rateLimit: {
          remaining: rateLimit.remaining,
          resetTime: rateLimit.resetTime,
          limit: PER_USER_LIMIT,
          globalLimit: maxGlobalRequests,
          globalRemaining: globalRateLimit.remaining,
        },
        githubTokens: hasToken ? {
          count: tokenCount,
          effectiveLimit: maxGlobalRequests,
          totalUsage: tokenUsage.total,
          usagePerToken: tokenUsage.perToken,
        } : undefined,
      },
    }
    
    if (githubRateLimit) {
      response.metadata.githubRateLimit = githubRateLimit
    }
    
    return NextResponse.json(response, {
      headers: {
        'X-RateLimit-Remaining': rateLimit.remaining.toString(),
        'X-RateLimit-Reset': rateLimit.resetTime.toString(),
        'X-RateLimit-Limit': PER_USER_LIMIT.toString(),
        'X-RateLimit-Global-Remaining': globalRateLimit.remaining.toString(),
        'X-RateLimit-Global-Limit': maxGlobalRequests.toString(),
      }
    })
  } catch (error) {
    console.error('Error in /api/explain:', error)
    
    if (error instanceof Error) {
      // Handle OpenAI API errors
      if (error.message.includes('API key') || error.message.includes('OPENAI_API_KEY')) {
        return NextResponse.json(
          { error: 'OpenAI API key is missing or invalid. Please check your environment variables.' },
          { status: 500 }
        )
      }
      
      // Handle rate limit errors
      if (error.message.includes('rate limit')) {
        return NextResponse.json(
          { error: error.message },
          { status: 429 }
        )
      }
      
      // Handle authentication errors
      if (error.message.includes('401') || error.message.includes('Unauthorized')) {
        return NextResponse.json(
          { error: 'Authentication failed. Please check your API keys.' },
          { status: 401 }
        )
      }
      
      // Handle not found errors
      if (error.message.includes('404') || error.message.includes('not found')) {
        return NextResponse.json(
          { error: error.message },
          { status: 404 }
        )
      }
      
      // Handle input validation errors
      if (error.message.includes('too long') || error.message.includes('Maximum allowed')) {
        return NextResponse.json(
          { error: error.message },
          { status: 400 }
        )
      }
      
      // Return specific error messages
      return NextResponse.json(
        { error: error.message || 'An unexpected error occurred' },
        { status: 500 }
      )
    }

    return NextResponse.json(
      { error: 'Failed to generate explanation. Please try again.' },
      { status: 500 }
    )
  }
}
