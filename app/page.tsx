'use client'

import { useState } from 'react'

interface Output {
  technicalExplanation: string
  resumeBullet: string
  interviewPitch: string
}

type InputMethod = 'text' | 'github' | 'upload'

export default function Home() {
  const [inputMethod, setInputMethod] = useState<InputMethod>('github')
  const [projectDescription, setProjectDescription] = useState('')
  const [githubUrl, setGithubUrl] = useState('')
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
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
      let response: Response

      if (inputMethod === 'upload' && uploadedFile) {
        const formData = new FormData()
        formData.append('file', uploadedFile)
        formData.append('audience', audience)
        formData.append('tone', tone)
        formData.append('inputMethod', 'upload')

        response = await fetch('/api/explain', {
          method: 'POST',
          body: formData,
        })
      } else {
        response = await fetch('/api/explain', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            projectDescription: inputMethod === 'github' ? githubUrl : projectDescription,
            audience,
            tone,
            inputMethod,
          }),
        })
      }

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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setUploadedFile(file)
      setError(null)
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
          {/* Input Method Tabs */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Input Method
            </label>
            <div className="flex space-x-2 border-b border-gray-200">
              <button
                type="button"
                onClick={() => {
                  setInputMethod('github')
                  setError(null)
                }}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  inputMethod === 'github'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                GitHub Repo
              </button>
              <button
                type="button"
                onClick={() => {
                  setInputMethod('text')
                  setError(null)
                }}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  inputMethod === 'text'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Text Description
              </button>
              <button
                type="button"
                onClick={() => {
                  setInputMethod('upload')
                  setError(null)
                }}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  inputMethod === 'upload'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Upload Project
              </button>
            </div>
          </div>

          {/* Text Input */}
          {inputMethod === 'text' && (
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
          )}

          {/* GitHub URL Input */}
          {inputMethod === 'github' && (
            <div className="mb-6">
              <label htmlFor="githubUrl" className="block text-sm font-medium text-gray-700 mb-2">
                GitHub Repository URL
              </label>
              <input
                id="githubUrl"
                type="url"
                value={githubUrl}
                onChange={(e) => setGithubUrl(e.target.value)}
                placeholder="https://github.com/username/repo"
                className="w-full px-4 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
              />
              <p className="mt-2 text-sm text-gray-500">
                Paste the full GitHub repository URL. We'll fetch the README and repository information.
              </p>
            </div>
          )}

          {/* File Upload Input */}
          {inputMethod === 'upload' && (
            <div className="mb-6">
              <label htmlFor="fileUpload" className="block text-sm font-medium text-gray-700 mb-2">
                Upload Project Files
              </label>
              <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-md hover:border-gray-400 transition-colors">
                <div className="space-y-1 text-center">
                  <svg
                    className="mx-auto h-12 w-12 text-gray-400"
                    stroke="currentColor"
                    fill="none"
                    viewBox="0 0 48 48"
                    aria-hidden="true"
                  >
                    <path
                      d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <div className="flex text-sm text-gray-600">
                    <label
                      htmlFor="fileUpload"
                      className="relative cursor-pointer bg-white rounded-md font-medium text-blue-600 hover:text-blue-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-blue-500"
                    >
                      <span>Upload a file</span>
                      <input
                        id="fileUpload"
                        name="fileUpload"
                        type="file"
                        className="sr-only"
                        onChange={handleFileChange}
                        accept=".zip,.tar,.tar.gz"
                        required={inputMethod === 'upload'}
                      />
                    </label>
                    <p className="pl-1">or drag and drop</p>
                  </div>
                  <p className="text-xs text-gray-500">ZIP, TAR, or TAR.GZ up to 50MB</p>
                  {uploadedFile && (
                    <p className="text-sm text-green-600 mt-2">✓ {uploadedFile.name}</p>
                  )}
                </div>
              </div>
            </div>
          )}

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
