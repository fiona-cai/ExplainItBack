'use client'

import { useState } from 'react'

interface Output {
  technicalExplanation: string
  resumeBullet: string
  interviewPitch: string
}

export default function Home() {
  const [projectDescription, setProjectDescription] = useState('')
  const [audience, setAudience] = useState<'recruiter' | 'engineer' | 'non-technical'>('engineer')
  const [tone, setTone] = useState<'concise' | 'confident' | 'technical'>('confident')
  const [output, setOutput] = useState<Output | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setOutput(null)

    try {
      const response = await fetch('/api/explain', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectDescription,
          audience,
          tone,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to generate explanation')
      }

      const data = await response.json()
      setOutput(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  const copyToClipboard = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(id)
      setTimeout(() => setCopied(null), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">ExplainItBack</h1>
          <p className="text-gray-600">Transform your project into clear explanations, resume bullets, and interview pitches</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-md p-6 mb-8">
          <div className="mb-6">
            <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-2">
              Project Description
            </label>
            <textarea
              id="description"
              rows={8}
              value={projectDescription}
              onChange={(e) => setProjectDescription(e.target.value)}
              placeholder="Paste your raw project description here..."
              className="w-full px-4 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <div>
              <label htmlFor="audience" className="block text-sm font-medium text-gray-700 mb-2">
                Audience
              </label>
              <select
                id="audience"
                value={audience}
                onChange={(e) => setAudience(e.target.value as typeof audience)}
                className="w-full px-4 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="recruiter">Recruiter</option>
                <option value="engineer">Engineer</option>
                <option value="non-technical">Non-Technical</option>
              </select>
            </div>

            <div>
              <label htmlFor="tone" className="block text-sm font-medium text-gray-700 mb-2">
                Tone
              </label>
              <select
                id="tone"
                value={tone}
                onChange={(e) => setTone(e.target.value as typeof tone)}
                className="w-full px-4 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="concise">Concise</option>
                <option value="confident">Confident</option>
                <option value="technical">Technical</option>
              </select>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-3 px-4 rounded-md font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Generating...' : 'Explain My Project'}
          </button>
        </form>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md mb-6">
            {error}
          </div>
        )}

        {loading && (
          <div className="bg-white rounded-lg shadow-md p-8 text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="mt-4 text-gray-600">Generating your explanations...</p>
          </div>
        )}

        {output && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-gray-900">Technical Explanation</h2>
                <button
                  onClick={() => copyToClipboard(output.technicalExplanation, 'technical')}
                  className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                >
                  {copied === 'technical' ? '✓ Copied' : 'Copy'}
                </button>
              </div>
              <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">{output.technicalExplanation}</p>
            </div>

            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-gray-900">Resume Bullet</h2>
                <button
                  onClick={() => copyToClipboard(output.resumeBullet, 'resume')}
                  className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                >
                  {copied === 'resume' ? '✓ Copied' : 'Copy'}
                </button>
              </div>
              <p className="text-gray-700 leading-relaxed">{output.resumeBullet}</p>
            </div>

            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-gray-900">Interview Pitch</h2>
                <button
                  onClick={() => copyToClipboard(output.interviewPitch, 'pitch')}
                  className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                >
                  {copied === 'pitch' ? '✓ Copied' : 'Copy'}
                </button>
              </div>
              <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">{output.interviewPitch}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
