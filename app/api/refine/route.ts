import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { validateEnv } from '@/lib/env'
import { checkRateLimit, getClientIdentifier } from '@/lib/rateLimit'

export const runtime = 'nodejs'
export const maxDuration = 60

try {
  validateEnv()
} catch (error) {
  console.error('Environment validation failed:', error)
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

interface RefineRequest {
  content: string
  refineType: 'resume-bullets' | 'interview-pitch' | 'technical-explanation'
  action: 'make-concise' | 'add-metrics' | 'make-senior' | 'faang-style' | 'more-impact' | 'simplify'
  originalContext?: string
}

const refinePrompts: Record<string, Record<string, string>> = {
  'resume-bullets': {
    'make-concise': 'Make this resume bullet more concise while keeping all key information. Remove filler words and get straight to the point.',
    'add-metrics': 'Add specific metrics, numbers, or quantifiable results to this resume bullet. If metrics aren\'t available, suggest where they could be added.',
    'make-senior': 'Rewrite this resume bullet for a senior-level position. Use more advanced terminology and emphasize leadership, architecture, and impact.',
    'faang-style': 'Rewrite this resume bullet in FAANG-style: action verb + what you built + impact/metrics. Make it crisp and ATS-optimized.',
    'more-impact': 'Emphasize the impact and outcomes more strongly. Focus on what changed or improved because of this work.',
    'simplify': 'Simplify this resume bullet for a non-technical audience while keeping the core accomplishment clear.',
  },
  'interview-pitch': {
    'make-concise': 'Make this interview pitch more concise - aim for 20-25 seconds instead of 30. Keep the most impactful points.',
    'add-metrics': 'Add specific metrics or numbers to make this pitch more compelling and concrete.',
    'make-senior': 'Adjust this pitch for a senior-level interview. Emphasize technical leadership and architectural decisions.',
    'faang-style': 'Rewrite this pitch in a FAANG interview style: problem → approach → impact, with emphasis on scale and technical depth.',
    'more-impact': 'Emphasize the impact and business value more strongly in this pitch.',
    'simplify': 'Simplify this pitch for a non-technical interviewer while keeping it engaging.',
  },
  'technical-explanation': {
    'make-concise': 'Make this technical explanation more concise while preserving all critical technical details.',
    'add-metrics': 'Add specific metrics, performance numbers, or scale information to this explanation.',
    'make-senior': 'Deepen this explanation for a senior technical audience. Include more architectural and design decision details.',
    'faang-style': 'Rewrite this explanation in a FAANG technical style: emphasize scale, performance, and system design.',
    'more-impact': 'Emphasize the technical impact and innovation more strongly.',
    'simplify': 'Simplify this explanation for a less technical audience while maintaining accuracy.',
  },
}

async function refineContent(
  content: string,
  refineType: RefineRequest['refineType'],
  action: RefineRequest['action'],
  originalContext?: string
): Promise<string> {
  const prompt = refinePrompts[refineType]?.[action] || 'Improve this content based on the requested action.'
  
  const systemPrompt = `You are an expert at refining technical content for resumes, interviews, and explanations. Your role is to improve content based on specific refinement requests while maintaining accuracy and authenticity.

Guidelines:
- Never invent metrics, technologies, or features that weren't in the original
- Maintain the core meaning and facts
- Apply the requested refinement style consistently
- Keep the output format appropriate for the content type
- Vary your language to avoid repetition - use synonyms and varied references instead of repeating the same phrases`

  const userPrompt = `Original content:
${content}

${originalContext ? `Original project context:\n${originalContext}\n\n` : ''}
Refinement request: ${prompt}

Please provide the refined version. Return only the refined content, no explanations or meta-commentary.`

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.7,
    max_tokens: 2000,
  })

  const refined = completion.choices[0]?.message?.content?.trim()
  if (!refined) {
    throw new Error('No response from OpenAI')
  }

  return refined
}

export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    const clientId = getClientIdentifier(request)
    const rateLimit = checkRateLimit(clientId, 20, 60 * 60 * 1000) // 20 refines per hour
    
    if (!rateLimit.allowed) {
      const resetDate = new Date(rateLimit.resetTime).toLocaleTimeString()
      return NextResponse.json(
        { error: `Rate limit exceeded. Please try again after ${resetDate}.` },
        { status: 429 }
      )
    }

    const body: RefineRequest = await request.json()
    const { content, refineType, action, originalContext } = body

    if (!content || !refineType || !action) {
      return NextResponse.json(
        { error: 'Missing required fields: content, refineType, and action are required' },
        { status: 400 }
      )
    }

    const refined = await refineContent(content, refineType, action, originalContext)

    return NextResponse.json({
      refined,
      action,
      refineType,
    })
  } catch (error) {
    console.error('Error in /api/refine:', error)
    
    if (error instanceof Error) {
      if (error.message.includes('API key')) {
        return NextResponse.json(
          { error: 'OpenAI API key is missing or invalid' },
          { status: 500 }
        )
      }
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json(
      { error: 'Failed to refine content. Please try again.' },
      { status: 500 }
    )
  }
}
