import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { Octokit } from '@octokit/rest'
import JSZip from 'jszip'

// Configure route for larger file uploads
export const runtime = 'nodejs'
export const maxDuration = 60

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

interface RequestBody {
  projectDescription?: string
  audience?: 'recruiter' | 'engineer' | 'non-technical'
  tone?: 'concise' | 'confident' | 'technical'
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

// Fetch repository information from GitHub
async function fetchGitHubRepoInfo(owner: string, repo: string): Promise<string> {
  const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN, // Optional: can work without auth for public repos
  })

  try {
    // Fetch repository details
    const { data: repoData } = await octokit.repos.get({
      owner,
      repo,
    })

    // Fetch README if available
    let readmeContent = ''
    try {
      const { data: readmeData } = await octokit.repos.getReadme({
        owner,
        repo,
      })
      if (readmeData.content) {
        readmeContent = Buffer.from(readmeData.content, 'base64').toString('utf-8')
      }
    } catch {
      // README might not exist, continue without it
    }

    // Fetch package.json if available (for Node.js projects)
    let packageJsonContent = ''
    try {
      const { data: packageData } = await octokit.repos.getContent({
        owner,
        repo,
        path: 'package.json',
      })
      if ('content' in packageData && packageData.content) {
        packageJsonContent = Buffer.from(packageData.content, 'base64').toString('utf-8')
      }
    } catch {
      // package.json might not exist, continue without it
    }

    // Build project description from fetched data
    let description = `Repository: ${owner}/${repo}\n`
    description += `Description: ${repoData.description || 'No description provided'}\n`
    description += `Language: ${repoData.language || 'Not specified'}\n`
    description += `Stars: ${repoData.stargazers_count}\n`
    description += `Forks: ${repoData.forks_count}\n\n`

    if (readmeContent) {
      description += `README:\n${readmeContent}\n\n`
    }

    if (packageJsonContent) {
      try {
        const packageJson = JSON.parse(packageJsonContent)
        description += `Package.json:\n${JSON.stringify(packageJson, null, 2)}\n\n`
      } catch {
        description += `Package.json (raw):\n${packageJsonContent}\n\n`
      }
    }

    return description
  } catch (error: any) {
    if (error.status === 404) {
      throw new Error('Repository not found. Please check the URL and ensure the repository is public.')
    }
    throw new Error(`Failed to fetch repository: ${error.message}`)
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
      let matchingFile: JSZip.JSZipObject | null = null
      
      zip.forEach((relativePath, file) => {
        if (!matchingFile && regex.test(relativePath) && !relativePath.endsWith('/')) {
          matchingFile = file
        }
      })
      
      if (matchingFile) {
        foundFiles.push(fileName)
        try {
          const content = await matchingFile.async('string')
          description += `--- ${matchingFile.name} ---\n${content}\n\n`
        } catch {
          // Skip if can't read as string (binary file)
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
  audience: 'recruiter' | 'engineer' | 'non-technical',
  tone: 'concise' | 'confident' | 'technical'
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

Generate three outputs based on the project description above:

1. Technical Explanation (5-7 sentences):
   - Explain what the project does and how it works
   - Use concrete technical details from the description
   - Avoid generic statements or buzzwords
   - Match the technical depth to the audience (${audience})
   - Use a ${tone} tone

2. Resume Bullet (single line):
   - Start with a strong action verb
   - Include a quantifiable impact or key technical achievement if mentioned
   - Be specific about technologies or approaches used
   - Keep it concise and impactful

3. Interview Pitch (30-second spoken format):
   - Natural, conversational language suitable for speaking
   - Highlight the problem solved and your approach
   - Mention 1-2 key technical decisions or features
   - End with the impact or outcome
   - Should take approximately 30 seconds to read aloud

CRITICAL CONSTRAINTS:
- Only include information explicitly stated in the project description
- Do not invent features, technologies, or capabilities
- If specific technologies aren't mentioned, use general but accurate terms
- Maintain technical accuracy while adapting to audience level

Return your response as a JSON object with exactly these fields:
{
  "technicalExplanation": "...",
  "resumeBullet": "...",
  "interviewPitch": "..."
}`

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.7,
  })

  const content = completion.choices[0]?.message?.content
  if (!content) {
    throw new Error('No response from OpenAI')
  }

  const result = JSON.parse(content)

  // Validate the response structure
  if (!result.technicalExplanation || !result.resumeBullet || !result.interviewPitch) {
    throw new Error('Invalid response format from OpenAI')
  }

  return result
}

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || ''
    
    let projectDescription = ''
    let audience: 'recruiter' | 'engineer' | 'non-technical' = 'engineer'
    let tone: 'concise' | 'confident' | 'technical' = 'confident'
    let inputMethod: 'text' | 'github' | 'upload' = 'text'

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

      audience = (audienceStr as typeof audience) || 'engineer'
      tone = (toneStr as typeof tone) || 'confident'
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
        projectDescription = await fetchGitHubRepoInfo(repoInfo.owner, repoInfo.repo)
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

    const result = await generateExplanation(projectDescription, audience, tone)
    return NextResponse.json(result)
  } catch (error) {
    console.error('Error in /api/explain:', error)
    
    if (error instanceof Error) {
      // Handle OpenAI API errors
      if (error.message.includes('API key')) {
        return NextResponse.json(
          { error: 'OpenAI API key is missing or invalid' },
          { status: 500 }
        )
      }
      
      // Return specific error messages
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json(
      { error: 'Failed to generate explanation. Please try again.' },
      { status: 500 }
    )
  }
}
