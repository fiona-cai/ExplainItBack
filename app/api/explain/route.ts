import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

interface RequestBody {
  projectDescription: string
  audience?: 'recruiter' | 'engineer' | 'non-technical'
  tone?: 'concise' | 'confident' | 'technical'
}

export async function POST(request: NextRequest) {
  try {
    const body: RequestBody = await request.json()
    const { projectDescription, audience = 'engineer', tone = 'confident' } = body

    if (!projectDescription || projectDescription.trim().length === 0) {
      return NextResponse.json(
        { error: 'Project description is required' },
        { status: 400 }
      )
    }

    // System prompt: frames the model as an expert technical communicator
    const systemPrompt = `You are an expert technical communicator specializing in translating complex project descriptions into clear, accurate explanations for different audiences. Your role is to:
- Preserve technical accuracy without inventing features
- Use concrete mechanisms and specific technologies over vague buzzwords
- Adapt language and depth based on the target audience
- Generate precise, actionable outputs that reflect only what is stated in the input

You never hallucinate features, technologies, or capabilities that aren't explicitly mentioned in the project description.`

    // User prompt: includes project text, audience, tone, and explicit output instructions
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
    }

    return NextResponse.json(
      { error: 'Failed to generate explanation. Please try again.' },
      { status: 500 }
    )
  }
}
