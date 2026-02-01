'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Toaster } from '@/components/ui/toaster'
import { toast } from 'sonner'
import ColorBends from '@/components/ColorBends'
import { 
  Copy, 
  Check, 
  Loader2, 
  Github, 
  FileText,
  AlertCircle, 
  Target,
  MessageSquare,
  Edit,
  RefreshCw,
  TrendingUp,
  Award
} from 'lucide-react'

interface Output {
  technicalExplanation: string
  resumeBullets: string[]
  interviewPitch: string
  metadata?: {
    inputLength?: number
    estimatedTokens?: number
    rateLimit?: {
      remaining: number
      resetTime: number
      maxRequests?: number
    }
    githubRateLimit?: {
      remaining: number
      reset: number
    }
    githubTokens?: {
      count: number
      effectiveLimit: number
      totalUsage?: number
      usagePerToken?: number[]
    }
  }
}

type RefineAction = 'make-concise' | 'add-metrics' | 'make-senior' | 'faang-style' | 'more-impact' | 'simplify'
type RefineType = 'resume-bullets' | 'interview-pitch' | 'technical-explanation'

type InputMethod = 'github'

const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB
// Token estimation: ~4 characters = 1 token
const TOKENS_PER_CHAR = 0.25
const MAX_PROJECT_TOKENS = 122000 // 128K - 6K for prompts/output
const MAX_INPUT_CHARACTERS = Math.floor(MAX_PROJECT_TOKENS / TOKENS_PER_CHAR) // ~488,000 characters
const MAX_INPUT_CHARACTERS_WARNING = Math.floor(MAX_PROJECT_TOKENS * 0.75 / TOKENS_PER_CHAR) // ~366,000 characters

export default function Home() {
  const router = useRouter()
  const [githubUrl, setGithubUrl] = useState('')
  const [githubUsername, setGithubUsername] = useState('')
  const [githubRepo, setGithubRepo] = useState('')
  const [startingInterview, setStartingInterview] = useState(false)
  const [audience, setAudience] = useState<'recruiter' | 'engineer' | 'hiring-manager' | 'founder-product'>('engineer')
  const [tone, setTone] = useState<'confident' | 'concise' | 'conversational' | 'technical'>('confident')
  const [output, setOutput] = useState<Output | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [progress, setProgress] = useState<{ message: string; filesFetched?: number; tokens?: number } | null>(null)
  const [rateLimitInfo, setRateLimitInfo] = useState<{ remaining: number; resetTime?: number } | null>(null)
  const [refining, setRefining] = useState<{ type: RefineType; action: RefineAction } | null>(null)
  const [refinedContent, setRefinedContent] = useState<{
    'resume-bullets'?: string[]
    'interview-pitch'?: string
    'technical-explanation'?: string
  }>({})
  const [githubRepoInfo, setGithubRepoInfo] = useState<{ name: string; description: string; stars: number; owner: string } | null>(null)
  const [fetchingGithub, setFetchingGithub] = useState(false)

  const getGithubUrl = (): string => {
    if (githubUsername.trim() && githubRepo.trim()) {
      return `https://github.com/${githubUsername.trim()}/${githubRepo.trim()}`
    }
    return githubUrl
  }

  const normalizeGithubUrl = (input: string): string => {
    const trimmed = input.trim()
    if (!trimmed) return ''
    
    // If it's already a full URL, return as is
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      return trimmed
    }
    
    // If it starts with github.com, add https://
    if (trimmed.startsWith('github.com/')) {
      return `https://${trimmed}`
    }
    
    // If it's just a repo path (username/repo), add the full URL prefix
    if (trimmed.includes('/') && !trimmed.includes('://')) {
      return `https://github.com/${trimmed}`
    }
    
    // Otherwise, assume it's a repo path and add the prefix
    return `https://github.com/${trimmed}`
  }

  const validateInput = (): boolean => {
    const githubUrlValue = getGithubUrl()
    if (!githubUrlValue || (!githubUsername.trim() && !githubRepo.trim() && !githubUrl.trim())) {
      setError('Please enter a GitHub repository URL')
      toast.error('GitHub URL is required')
      return false
    }
    if (!githubRepoInfo) {
      setError('Please fetch the repository first by clicking the Fetch button')
      toast.error('Repository not fetched')
      return false
    }
    try {
      const normalizedUrl = normalizeGithubUrl(githubUrlValue)
      const urlObj = new URL(normalizedUrl)
      if (!urlObj.hostname.includes('github.com')) {
        setError('Please enter a valid GitHub repository URL')
        toast.error('Invalid GitHub URL')
        return false
      }
    } catch {
      setError('Please enter a valid URL')
      toast.error('Invalid URL format')
      return false
    }
    return true
  }

  const handleFetchGithub = async () => {
    const githubUrlValue = getGithubUrl()
    if (!githubUrlValue || (!githubUsername.trim() && !githubRepo.trim() && !githubUrl.trim())) {
      setError('Please enter a GitHub repository URL')
      toast.error('GitHub URL is required')
      return
    }

    setFetchingGithub(true)
    setError(null)

    try {
      // Normalize the URL
      const normalizedUrl = normalizeGithubUrl(githubUrlValue)
      
      // Validate the URL
      const urlObj = new URL(normalizedUrl)
      if (!urlObj.hostname.includes('github.com')) {
        throw new Error('Please enter a valid GitHub repository URL')
      }

      // Parse the GitHub URL
      const parts = urlObj.pathname.split('/').filter(Boolean)
      if (parts.length < 2) {
        throw new Error('Invalid GitHub URL format. Please use format: username/repo')
      }
      const owner = parts[0]
      const repo = parts[1].replace(/\.git$/, '')

      // Fetch repo info from GitHub API
      const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`)
      
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Repository not found. Please check the URL.')
        }
        if (response.status === 403) {
          throw new Error('Access forbidden. The repository may be private.')
        }
        throw new Error('Failed to fetch repository information')
      }

      const repoData = await response.json()
      
      setGithubRepoInfo({
        name: repoData.name,
        description: repoData.description || 'No description available',
        stars: repoData.stargazers_count || 0,
        owner: repoData.owner.login
      })

      toast.success('Repository fetched successfully!')
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch repository'
      setError(errorMessage)
      toast.error(errorMessage)
      setGithubRepoInfo(null)
    } finally {
      setFetchingGithub(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!validateInput()) {
      return
    }

    setLoading(true)
    setError(null)
    setOutput(null)
    setRateLimitInfo(null)
    
    setProgress({ message: 'Fetching repository information and analyzing files...' })

    try {
      const githubUrlValue = getGithubUrl()
      const normalizedUrl = normalizeGithubUrl(githubUrlValue)
      const response = await fetch('/api/explain', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectDescription: normalizedUrl,
          audience,
          tone,
          inputMethod: 'github',
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        
        // Handle rate limit errors
        if (response.status === 429) {
          const resetTime = data.rateLimit?.resetTime 
            ? new Date(data.rateLimit.resetTime).toLocaleTimeString()
            : 'soon'
          throw new Error(`${data.error || 'Rate limit exceeded'}. Please try again after ${resetTime}.`)
        }
        
        throw new Error(data.error || 'Failed to generate explanation')
      }

      const data = await response.json()
      setOutput(data)
      
      // Update rate limit info (only show remaining, not technical details)
      if (data.metadata?.rateLimit) {
        setRateLimitInfo({
          remaining: data.metadata.rateLimit.remaining,
          resetTime: data.metadata.rateLimit.resetTime,
        })
      }
      
      // Show warnings only if critical
      if (data.metadata?.githubRateLimit && data.metadata.githubRateLimit.remaining < 5) {
        toast.warning('GitHub API rate limit is very low. Some features may be unavailable.')
      }
      
      // Show warnings for long inputs
      if (data.metadata?.estimatedTokens && data.metadata.estimatedTokens > 75000) {
        toast.warning('Large input detected. Results may be truncated.')
      }
      
      toast.success('Explanations generated successfully!')
      setProgress(null)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred'
      setError(errorMessage)
      toast.error(errorMessage)
      setProgress(null)
    } finally {
      setLoading(false)
    }
  }


  const copyToClipboard = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(id)
      toast.success('Copied to clipboard!')
      setTimeout(() => setCopied(null), 2000)
    } catch (err) {
      toast.error('Failed to copy to clipboard')
      console.error('Failed to copy:', err)
    }
  }

  const startInterview = async () => {
    const githubUrlValue = getGithubUrl()
    if (!githubUrlValue || (!githubUsername.trim() && !githubRepo.trim() && !githubUrl.trim())) {
      toast.error('Please enter a GitHub URL first')
      return
    }

    setStartingInterview(true)
    try {
      const normalizedUrl = normalizeGithubUrl(githubUrlValue)
      const response = await fetch('/api/interview/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repoUrl: normalizedUrl,
          repoId: githubRepoInfo ? `${githubRepoInfo.owner}/${githubRepoInfo.name}` : normalizedUrl
        })
      })

      const data = await response.json()

      if (data.success && data.sessionId) {
        toast.success('Starting Interview Mode...')
        router.push(`/interview/${data.sessionId}`)
      } else {
        toast.error(data.error || 'Failed to start interview mode')
      }
    } catch (error) {
      console.error('Failed to start interview:', error)
      toast.error('Failed to start interview mode')
    } finally {
      setStartingInterview(false)
    }
  }

  const handleRefine = async (
    content: string,
    refineType: RefineType,
    action: RefineAction
  ) => {
    if (!output) return

    setRefining({ type: refineType, action })
    try {
      const response = await fetch('/api/refine', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content,
          refineType,
          action,
          originalContext: output.technicalExplanation, // Provide context
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to refine content')
      }

      const data = await response.json()
      
      // Update the refined content state
      if (refineType === 'resume-bullets') {
        // Parse bullets if it's a string
        const bullets = typeof data.refined === 'string' 
          ? data.refined.split('\n').filter((b: string) => b.trim()).map((b: string) => b.replace(/^[•\-\*]\s*/, '').trim())
          : data.refined
        setRefinedContent(prev => ({ ...prev, 'resume-bullets': bullets }))
      } else {
        setRefinedContent(prev => ({ ...prev, [refineType]: data.refined }))
      }

      toast.success('Content refined successfully!')
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to refine content'
      toast.error(errorMessage)
    } finally {
      setRefining(null)
    }
  }

  const getDisplayContent = (type: RefineType, original: string | string[]): string | string[] => {
    const refined = refinedContent[type]
    if (refined) {
      return refined
    }
    return original
  }

  return (
    <>
      <div className="h-screen bg-background relative overflow-hidden">
        {/* Background */}
        <div className="fixed inset-0 z-0 bg-background">
          <ColorBends
            rotation={180}
            autoRotate={-5}
            speed={0.07}
            scale={1.2}
            frequency={1.4}
            warpStrength={0}
            mouseInfluence={2}
            parallax={0.9}
            noise={0}
            transparent
          />
        </div>
        {/* Content */}
        <div className="relative z-10 h-full overflow-y-auto">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 sm:pt-16 pb-6 sm:pb-8">
          {/* Header */}
          <div className="text-center mb-8 sm:mb-10 fade-in-up overflow-visible">
            <h1 className="text-5xl sm:text-6xl font-bold text-foreground raleway fade-in-up leading-tight tracking-tight">
              ExplainIt<span className="italic font-light">Back.</span>
            </h1>
          </div>

          {/* Input Form */}
          <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5 mb-6 sm:mb-8">
            <Card className="glass-card fade-in-up border-0 mb-4 sm:mb-5" style={{ animationDelay: '0.1s' }}>
              <CardContent className="pt-6 pb-6 px-6">
                <div className="space-y-4">
                  <div className="flex items-center gap-4">
                    <div className="flex gap-3 flex-1">
                      <div className="flex items-center justify-center">
                        <Github className="h-6 w-6 text-foreground shrink-0" />
                      </div>
                      <div className="flex items-center flex-1 gap-2 min-w-0">
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-foreground/90 text-base sm:text-lg whitespace-nowrap">
                            https://github.com/
                          </span>
                        </div>
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <div className="relative inline-block">
                            <Input
                              id="githubUsername"
                              type="text"
                              value={githubUsername}
                              onChange={(e) => {
                                setGithubUsername(e.target.value)
                                setGithubRepoInfo(null)
                              }}
                              onPaste={(e) => {
                                e.preventDefault()
                                const pastedText = e.clipboardData.getData('text')
                                
                                // If it's a full GitHub URL, extract username and repo
                                if (pastedText.includes('github.com/')) {
                                  try {
                                    const url = new URL(pastedText.startsWith('http') ? pastedText : `https://${pastedText}`)
                                    if (url.hostname.includes('github.com')) {
                                      const parts = url.pathname.split('/').filter(Boolean)
                                      if (parts.length >= 2) {
                                        setGithubUsername(parts[0])
                                        setGithubRepo(parts[1].replace(/\.git$/, ''))
                                        setGithubUrl('')
                                        setGithubRepoInfo(null)
                                        return
                                      }
                                    }
                                  } catch {
                                    // If URL parsing fails, try to extract manually
                                    const match = pastedText.match(/github\.com\/([^\/\s]+)\/([^\/\s]+)/)
                                    if (match && match[1] && match[2]) {
                                      setGithubUsername(match[1])
                                      setGithubRepo(match[2].replace(/\.git$/, ''))
                                      setGithubUrl('')
                                      setGithubRepoInfo(null)
                                      return
                                    }
                                  }
                                }
                                
                                // If it contains a slash, try to split it
                                if (pastedText.includes('/')) {
                                  const parts = pastedText.split('/').filter(Boolean)
                                  if (parts.length >= 2) {
                                    setGithubUsername(parts[0])
                                    setGithubRepo(parts[1].replace(/\.git$/, ''))
                                    setGithubUrl('')
                                    setGithubRepoInfo(null)
                                    return
                                  }
                                }
                                
                                // Otherwise, just paste as username
                                setGithubUsername(pastedText)
                                setGithubRepoInfo(null)
                              }}
                              placeholder="username"
                              className="glass-input text-lg h-14 fade-in-up transition-all focus:ring-2 focus:ring-foreground/30 border-0"
                              style={{ 
                                animationDelay: '0.2s',
                                width: githubUsername ? `${Math.max(120, githubUsername.length * 9 + 32)}px` : '120px',
                                minWidth: '120px'
                              }}
                            />
                          </div>
                          <span className="text-foreground/90 text-lg shrink-0">/</span>
                          <Input
                            id="githubRepo"
                            type="text"
                            value={githubRepo}
                            onChange={(e) => {
                              setGithubRepo(e.target.value)
                              setGithubRepoInfo(null)
                            }}
                            onKeyDown={(e) => {
                              // If user presses Enter in repo field and both fields are filled, trigger fetch
                              if (e.key === 'Enter' && githubUsername.trim() && githubRepo.trim()) {
                                e.preventDefault()
                                handleFetchGithub()
                              }
                            }}
                            placeholder="repo"
                            className="glass-input text-lg h-14 fade-in-up transition-all focus:ring-2 focus:ring-foreground/30 border-0 flex-1 min-w-0"
                            style={{ animationDelay: '0.2s' }}
                          />
                        </div>
                      </div>
                      <Button
                        type="button"
                        onClick={handleFetchGithub}
                        disabled={fetchingGithub || (!githubUsername.trim() && !githubRepo.trim() && !githubUrl.trim())}
                        className="shrink-0 h-14 px-6 text-base"
                      >
                        {fetchingGithub ? (
                          <>
                            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                            Fetching...
                          </>
                        ) : (
                          <>
                            <Github className="mr-2 h-5 w-5" />
                            Fetch
                          </>
                        )}
                      </Button>
                    </div>
                  </div>

                  {githubRepoInfo && (
                    <div className="p-4 glass rounded-lg fade-in-up border-0 transition-all mt-4">
                      <div className="flex items-start gap-3">
                        <Check className="h-5 w-5 text-foreground mt-0.5 shrink-0" />
                        <div className="flex-1 space-y-1.5">
                          <div className="flex items-center gap-2">
                            <h4 className="text-base font-semibold text-foreground">
                              {githubRepoInfo.owner}/{githubRepoInfo.name}
                            </h4>
                            {githubRepoInfo.stars > 0 && (
                              <span className="text-sm text-muted-foreground flex items-center gap-1">
                                <span>⭐</span>
                                {githubRepoInfo.stars.toLocaleString()}
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground line-clamp-2">
                            {githubRepoInfo.description}
                          </p>
                          <p className="text-sm text-foreground">
                            Repository fetched successfully!
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Configure Output */}
            {githubRepoInfo && (
            <Card className="glass-card fade-in-up border-0 mb-4 sm:mb-5" style={{ animationDelay: '0.2s' }}>
              <CardHeader className="glass-card-header pb-4 px-6 pt-6">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-foreground/10 border border-foreground/20 text-foreground font-semibold text-xs">
                    2
                  </div>
                  <div>
                    <CardTitle className="text-lg font-semibold">Configure Output</CardTitle>
                    <CardDescription className="mt-1 text-xs text-muted-foreground">
                      Set audience and tone
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-4 pb-6 px-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
                    <div className="space-y-3">
                      <div>
                        <label htmlFor="audience" className="text-sm font-semibold flex items-center gap-2 mb-2 text-foreground">
                          <Target className="h-4 w-4" />
                          Audience
                        </label>
                        <p className="text-xs text-muted-foreground mb-3">
                          Technical depth
                        </p>
                        <Select value={audience} onValueChange={(value) => setAudience(value as typeof audience)}>
                          <SelectTrigger id="audience" className="h-11 transition-all focus:ring-2 focus:ring-foreground/50 text-left">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="recruiter">
                              <div>
                                <div className="font-medium">Recruiter</div>
                                <div className="text-xs text-muted-foreground">Clear, high-level explanation focused on impact</div>
                              </div>
                            </SelectItem>
                            <SelectItem value="engineer">
                              <div>
                                <div className="font-medium">Engineer</div>
                                <div className="text-xs text-muted-foreground">Technical depth, architecture, and tools</div>
                              </div>
                            </SelectItem>
                            <SelectItem value="hiring-manager">
                              <div>
                                <div className="font-medium">Hiring Manager</div>
                                <div className="text-xs text-muted-foreground">Ownership, scope, and decision-making</div>
                              </div>
                            </SelectItem>
                            <SelectItem value="founder-product">
                              <div>
                                <div className="font-medium">Founder / Product</div>
                                <div className="text-xs text-muted-foreground">User value, tradeoffs, and speed</div>
                              </div>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <label htmlFor="tone" className="text-sm font-semibold flex items-center gap-2 mb-2 text-foreground">
                          <MessageSquare className="h-4 w-4" />
                          Tone
                        </label>
                        <p className="text-xs text-muted-foreground mb-3">
                          Writing style
                        </p>
                        <Select value={tone} onValueChange={(value) => setTone(value as typeof tone)}>
                          <SelectTrigger id="tone" className="h-11 transition-all focus:ring-2 focus:ring-foreground/50 text-left">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="confident">
                              <div>
                                <div className="font-medium">Confident</div>
                                <div className="text-xs text-muted-foreground">Default</div>
                              </div>
                            </SelectItem>
                            <SelectItem value="concise">
                              <div>
                                <div className="font-medium">Concise</div>
                              </div>
                            </SelectItem>
                            <SelectItem value="conversational">
                              <div>
                                <div className="font-medium">Conversational</div>
                              </div>
                            </SelectItem>
                            <SelectItem value="technical">
                              <div>
                                <div className="font-medium">Technical</div>
                              </div>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>

                  <Button 
                    type="submit" 
                    disabled={loading} 
                    className="glass-button-primary w-full h-12 text-base transition-all mt-6 border-0" 
                    size="lg"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Github className="mr-2 h-5 w-5" />
                        Explain My Project
                      </>
                    )}
                  </Button>
              </CardContent>
            </Card>
            )}
          </form>

          {/* Summary */}
          <Card className="glass-card mb-6 sm:mb-8 fade-in-up border-0" style={{ animationDelay: '0.15s' }}>
            <CardContent className="pt-6 pb-6 px-6">
              <div className="space-y-5">
                <div>
                  <h2 className="text-lg font-semibold text-foreground mb-1">What you'll get</h2>
                  <p className="text-xs text-muted-foreground">Three tailored outputs for your project</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-foreground/5 border border-foreground/10">
                        <Award className="h-4 w-4 text-foreground" />
                      </div>
                      <h3 className="text-sm font-semibold text-foreground">Resume Bullets</h3>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed pl-7">
                      Action-oriented bullet points highlighting technologies and impact, ready for your resume and LinkedIn.
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-foreground/5 border border-foreground/10">
                        <MessageSquare className="h-4 w-4 text-foreground" />
                      </div>
                      <h3 className="text-sm font-semibold text-foreground">Interview Pitch</h3>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed pl-7">
                      A concise explanation perfect for "Tell me about a project" questions, tailored to your audience.
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-foreground/5 border border-foreground/10">
                        <FileText className="h-4 w-4 text-foreground" />
                      </div>
                      <h3 className="text-sm font-semibold text-foreground">Technical Explanation</h3>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed pl-7">
                      Deep dive into architecture, tools, and implementation details for technical discussions.
                    </p>
                  </div>
                </div>
                <div className="border-t border-foreground/8 pt-4 mt-4">
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    <span className="font-semibold text-foreground">How it works:</span> We analyze your repository's code, structure, and documentation to generate professional explanations tailored to your chosen audience (Recruiter, Engineer, Hiring Manager, or Founder/Product) and tone.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>


          {/* Error Alert */}
          {error && (
            <Alert variant="destructive" className="mb-6 fade-in-up border-0">
              <AlertCircle className="h-3 w-3" />
              <AlertDescription className="text-xs text-destructive">{error}</AlertDescription>
            </Alert>
          )}

          {/* Loading State with Blurred Preview */}
          {loading && (
            <div className="mt-8 space-y-4 fade-in-up max-h-[calc(100vh-400px)] overflow-y-auto">
              <div className="relative mb-4 fade-in-up" style={{ animationDelay: '0.1s' }}>
                <div className="text-center mb-2">
                  <h2 className="text-lg sm:text-xl font-bold text-foreground gradient-text">Your Results</h2>
                </div>
                <div className="absolute top-0 right-0">
                  <div className="cool-spinner">
                    <div className="cool-spinner-inner"></div>
                  </div>
                </div>
                <p className="text-center text-xs text-muted-foreground">Ready to use in your resume, interviews, and applications</p>
                {progress?.filesFetched !== undefined && (
                  <p className="text-center text-xs text-muted-foreground mt-1">
                    Fetched {progress.filesFetched} file{progress.filesFetched !== 1 ? 's' : ''}
                    {progress.tokens !== undefined && (
                      <span className="ml-2">(~{progress.tokens.toLocaleString()} tokens)</span>
                    )}
                  </p>
                )}
              </div>

              {/* Blurred Resume Bullets Preview */}
              <Card className="glass-card fade-in-up blur-sm pointer-events-none border-0" style={{ animationDelay: '0.2s' }}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-foreground/5 border border-foreground/10">
                        <Award className="h-5 w-5 text-foreground" />
                      </div>
                      <div>
                        <CardTitle className="text-xl font-semibold">Resume Bullets</CardTitle>
                        <CardDescription className="mt-0.5">
                          For resumes and applications
                        </CardDescription>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="fade-in-up">
                  <div className="space-y-3">
                    <div className="p-3 bg-muted/50 rounded-md">
                      <div className="h-4 bg-muted rounded w-3/4 mb-2"></div>
                      <div className="h-4 bg-muted rounded w-full"></div>
                    </div>
                    <div className="p-3 bg-muted/50 rounded-md">
                      <div className="h-4 bg-muted rounded w-4/5 mb-2"></div>
                      <div className="h-4 bg-muted rounded w-full"></div>
                    </div>
                    <div className="p-3 bg-muted/50 rounded-md">
                      <div className="h-4 bg-muted rounded w-5/6 mb-2"></div>
                      <div className="h-4 bg-muted rounded w-3/4"></div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Blurred Interview Pitch Preview */}
              <Card className="glass-card fade-in-up blur-sm pointer-events-none border-0" style={{ animationDelay: '0.3s' }}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-foreground/5 border border-foreground/10">
                        <MessageSquare className="h-5 w-5 text-foreground" />
                      </div>
                      <div>
                        <CardTitle className="text-xl font-semibold">Interview Pitch</CardTitle>
                        <CardDescription className="mt-0.5">
                          For interview questions
                        </CardDescription>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="fade-in-up">
                  <div className="space-y-2">
                    <div className="h-4 bg-muted rounded w-full"></div>
                    <div className="h-4 bg-muted rounded w-full"></div>
                    <div className="h-4 bg-muted rounded w-5/6"></div>
                    <div className="h-4 bg-muted rounded w-full"></div>
                    <div className="h-4 bg-muted rounded w-4/5"></div>
                  </div>
                </CardContent>
              </Card>

              {/* Blurred Technical Explanation Preview */}
              <Card className="glass-card fade-in-up blur-sm pointer-events-none border-0" style={{ animationDelay: '0.4s' }}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-foreground/5 border border-foreground/10">
                        <FileText className="h-5 w-5 text-foreground" />
                      </div>
                      <div>
                        <CardTitle className="text-xl font-semibold">Technical Explanation</CardTitle>
                        <CardDescription className="mt-0.5">
                          For technical deep dives
                        </CardDescription>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="fade-in-up">
                  <div className="space-y-2">
                    <div className="h-4 bg-muted rounded w-full"></div>
                    <div className="h-4 bg-muted rounded w-11/12"></div>
                    <div className="h-4 bg-muted rounded w-full"></div>
                    <div className="h-4 bg-muted rounded w-10/12"></div>
                    <div className="h-4 bg-muted rounded w-full"></div>
                    <div className="h-4 bg-muted rounded w-9/12"></div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Rate Limit Info - De-emphasized */}
          {rateLimitInfo && rateLimitInfo.remaining < 2 && (
            <Alert className="mb-6 fade-in-up border-0" variant="default">
              <AlertCircle className="h-4 w-4 text-muted-foreground" />
              <AlertDescription className="text-sm text-muted-foreground">
                <span>
                  Requests remaining: <strong className="text-foreground">{rateLimitInfo.remaining}</strong>
                  {rateLimitInfo.resetTime && (
                    <span className="ml-2 text-xs">
                      (resets {new Date(rateLimitInfo.resetTime).toLocaleTimeString()})
                    </span>
                  )}
                </span>
              </AlertDescription>
            </Alert>
          )}

          {/* Output Cards - Reordered by value */}
          {output && (
            <div className="space-y-4 fade-in-up mt-8 max-h-[calc(100vh-250px)] overflow-y-auto" style={{ animationDelay: '0.1s' }}>
              <div className="relative mb-4 fade-in-up sticky top-0 bg-background/80 backdrop-blur-sm z-10 pb-2" style={{ animationDelay: '0.2s' }}>
                <div className="text-center mb-1">
                  <h2 className="text-lg sm:text-xl font-bold text-foreground gradient-text">Your Results</h2>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const allText = [
                      'RESUME BULLETS:',
                      ...(getDisplayContent('resume-bullets', output.resumeBullets) as string[]).map(b => '• ' + b),
                      '',
                      'INTERVIEW PITCH:',
                      getDisplayContent('interview-pitch', output.interviewPitch) as string,
                      '',
                      'TECHNICAL EXPLANATION:',
                      getDisplayContent('technical-explanation', output.technicalExplanation) as string,
                    ].join('\n')
                    copyToClipboard(allText, 'all')
                  }}
                  className="absolute top-0 right-0 shrink-0 transition-all text-xs h-7"
                >
                  {copied === 'all' ? (
                    <>
                      <Check className="mr-1 h-3 w-3" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="mr-1 h-3 w-3" />
                      Copy All
                    </>
                  )}
                </Button>
                <p className="text-center text-xs text-muted-foreground">Ready to use in your resume, interviews, and applications</p>
              </div>

              {/* 1. Resume Bullets - Most actionable, shown first */}
              <Card className="glass-card fade-in-up border-0" style={{ animationDelay: '0.3s' }}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-foreground/5 border border-foreground/10">
                        <Award className="h-4 w-4 text-foreground" />
                      </div>
                      <div>
                        <CardTitle className="text-base font-semibold">Resume Bullets</CardTitle>
                        <CardDescription className="mt-0 text-xs">
                          For resumes and applications
                        </CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="flex items-center gap-0.5">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const content = output.resumeBullets.join('\n')
                            handleRefine(content, 'resume-bullets', 'make-concise')
                          }}
                          disabled={refining?.type === 'resume-bullets'}
                          className="h-6 text-xs transition-all px-2"
                        >
                          {refining?.type === 'resume-bullets' && refining.action === 'make-concise' ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            'Concise'
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const content = output.resumeBullets.join('\n')
                            handleRefine(content, 'resume-bullets', 'add-metrics')
                          }}
                          disabled={refining?.type === 'resume-bullets'}
                          className="h-6 text-xs transition-all px-2"
                        >
                          {refining?.type === 'resume-bullets' && refining.action === 'add-metrics' ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            'Metrics'
                          )}
                        </Button>
                        <Select
                          value=""
                          onValueChange={(value: RefineAction) => {
                            const content = output.resumeBullets.join('\n')
                            handleRefine(content, 'resume-bullets', value)
                          }}
                        >
                          <SelectTrigger className="w-[70px] h-6 text-xs px-2" disabled={refining?.type === 'resume-bullets'}>
                            <SelectValue placeholder="More">
                              {refining?.type === 'resume-bullets' ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                'More'
                              )}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="make-senior">Make it more senior</SelectItem>
                            <SelectItem value="faang-style">FAANG-style</SelectItem>
                            <SelectItem value="more-impact">Emphasize impact</SelectItem>
                            <SelectItem value="simplify">Simplify</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const bullets = getDisplayContent('resume-bullets', output.resumeBullets) as string[]
                          copyToClipboard(bullets.map(b => '• ' + b).join('\n'), 'resume')
                        }}
                        className="shrink-0 h-6 w-6 p-0"
                      >
                        {copied === 'resume' ? (
                          <Check className="h-3 w-3" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="fade-in-up pt-3" style={{ animationDelay: '0.1s' }}>
                  {refinedContent['resume-bullets'] && (
                    <div className="mb-2 p-1.5 glass rounded-md flex items-center justify-between border-0">
                      <span className="text-xs text-foreground flex items-center gap-1.5">
                        <Check className="h-3 w-3" />
                        Refined version
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setRefinedContent(prev => {
                            const { 'resume-bullets': _, ...rest } = prev
                            return rest
                          })
                          toast.info('Reverted to original')
                        }}
                        className="h-6 text-xs px-2"
                      >
                        Revert
                      </Button>
                    </div>
                  )}
                  <ul className="text-foreground leading-relaxed text-sm font-medium list-disc pl-4 space-y-1.5">
                    {(getDisplayContent('resume-bullets', output.resumeBullets) as string[]).map((bullet, i) => (
                      <li key={i} className="pl-1 text-xs sm:text-sm">{bullet}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>

              {/* 2. Interview Pitch - Second most actionable */}
              <Card className="glass-card transition-shadow fade-in-up border-0" style={{ animationDelay: '0.3s' }}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-foreground/5 border border-foreground/10">
                        <MessageSquare className="h-4 w-4 text-foreground" />
                      </div>
                      <div>
                        <CardTitle className="text-base font-semibold">Interview Pitch</CardTitle>
                        <CardDescription className="mt-0 text-xs">
                          Ideal for "Tell me about a project" questions
                        </CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="flex items-center gap-0.5">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            handleRefine(output.interviewPitch, 'interview-pitch', 'make-concise')
                          }}
                          disabled={refining?.type === 'interview-pitch'}
                          className="h-6 text-xs transition-all px-2"
                        >
                          {refining?.type === 'interview-pitch' && refining.action === 'make-concise' ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            'Concise'
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            handleRefine(output.interviewPitch, 'interview-pitch', 'add-metrics')
                          }}
                          disabled={refining?.type === 'interview-pitch'}
                          className="h-6 text-xs transition-all px-2"
                        >
                          {refining?.type === 'interview-pitch' && refining.action === 'add-metrics' ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            'Metrics'
                          )}
                        </Button>
                        <Select
                          value=""
                          onValueChange={(value: RefineAction) => {
                            handleRefine(output.interviewPitch, 'interview-pitch', value)
                          }}
                        >
                          <SelectTrigger className="w-[70px] h-6 text-xs px-2" disabled={refining?.type === 'interview-pitch'}>
                            <SelectValue placeholder="More">
                              {refining?.type === 'interview-pitch' ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                'More'
                              )}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="make-senior">Make it more senior</SelectItem>
                            <SelectItem value="faang-style">FAANG-style</SelectItem>
                            <SelectItem value="more-impact">Emphasize impact</SelectItem>
                            <SelectItem value="simplify">Simplify</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const content = getDisplayContent('interview-pitch', output.interviewPitch) as string
                          copyToClipboard(content, 'pitch')
                        }}
                        className="shrink-0 h-6 w-6 p-0"
                      >
                        {copied === 'pitch' ? (
                          <Check className="h-3 w-3" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="fade-in-up pt-3" style={{ animationDelay: '0.1s' }}>
                  {refinedContent['interview-pitch'] && (
                    <div className="mb-2 p-1.5 glass rounded-md flex items-center justify-between border-0">
                      <span className="text-xs text-foreground flex items-center gap-1.5">
                        <Check className="h-3 w-3" />
                        Refined version
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setRefinedContent(prev => {
                            const { 'interview-pitch': _, ...rest } = prev
                            return rest
                          })
                          toast.info('Reverted to original')
                        }}
                        className="h-6 text-xs px-2"
                      >
                        Revert
                      </Button>
                    </div>
                  )}
                  <p className="text-foreground leading-relaxed whitespace-pre-wrap text-xs sm:text-sm max-h-32 overflow-y-auto">
                    {getDisplayContent('interview-pitch', output.interviewPitch) as string}
                  </p>
                </CardContent>
              </Card>

              {/* 3. Technical Explanation - Reference material, shown last */}
              <Card className="glass-card fade-in-up border-0" style={{ animationDelay: '0.5s' }}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-foreground/5 border border-foreground/10">
                        <FileText className="h-4 w-4 text-foreground" />
                      </div>
                      <div>
                        <CardTitle className="text-base font-semibold">Technical Explanation</CardTitle>
                        <CardDescription className="mt-0 text-xs">
                          For technical deep dives
                        </CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="flex items-center gap-0.5">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            handleRefine(output.technicalExplanation, 'technical-explanation', 'make-concise')
                          }}
                          disabled={refining?.type === 'technical-explanation'}
                          className="h-6 text-xs transition-all px-2"
                        >
                          {refining?.type === 'technical-explanation' && refining.action === 'make-concise' ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            'Concise'
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            handleRefine(output.technicalExplanation, 'technical-explanation', 'add-metrics')
                          }}
                          disabled={refining?.type === 'technical-explanation'}
                          className="h-6 text-xs transition-all px-2"
                        >
                          {refining?.type === 'technical-explanation' && refining.action === 'add-metrics' ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            'Metrics'
                          )}
                        </Button>
                        <Select
                          value=""
                          onValueChange={(value: RefineAction) => {
                            handleRefine(output.technicalExplanation, 'technical-explanation', value)
                          }}
                        >
                          <SelectTrigger className="w-[70px] h-6 text-xs px-2" disabled={refining?.type === 'technical-explanation'}>
                            <SelectValue placeholder="More">
                              {refining?.type === 'technical-explanation' ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                'More'
                              )}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="make-senior">Make it more senior</SelectItem>
                            <SelectItem value="faang-style">FAANG-style</SelectItem>
                            <SelectItem value="more-impact">Emphasize impact</SelectItem>
                            <SelectItem value="simplify">Simplify</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const content = getDisplayContent('technical-explanation', output.technicalExplanation) as string
                          copyToClipboard(content, 'technical')
                        }}
                        className="shrink-0 h-6 w-6 p-0"
                      >
                        {copied === 'technical' ? (
                          <Check className="h-3 w-3" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="fade-in-up pt-3" style={{ animationDelay: '0.1s' }}>
                  {refinedContent['technical-explanation'] && (
                    <div className="mb-2 p-1.5 glass rounded-md flex items-center justify-between border-0">
                      <span className="text-xs text-foreground flex items-center gap-1.5">
                        <Check className="h-3 w-3" />
                        Refined version
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setRefinedContent(prev => {
                            const { 'technical-explanation': _, ...rest } = prev
                            return rest
                          })
                          toast.info('Reverted to original')
                        }}
                        className="h-6 text-xs px-2"
                      >
                        Revert
                      </Button>
                    </div>
                  )}
                  <p className="text-foreground leading-relaxed whitespace-pre-wrap text-xs sm:text-sm max-h-32 overflow-y-auto">
                    {getDisplayContent('technical-explanation', output.technicalExplanation) as string}
                  </p>
                </CardContent>
              </Card>

              {/* Interview Mode CTA */}
              <Card className="border-2 border-dashed border-foreground/30 bg-muted/30 fade-in-up" style={{ animationDelay: '0.6s' }}>
                <CardContent className="pt-3 pb-3">
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-foreground/10">
                        <Target className="h-4 w-4 text-foreground" />
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-foreground">Ready for a Technical Deep Dive?</h3>
                        <p className="text-xs text-muted-foreground">
                          Test your understanding with AI-powered interview questions
                        </p>
                      </div>
                    </div>
                    <Button
                      onClick={startInterview}
                      disabled={startingInterview}
                      className="shrink-0 h-8 text-xs"
                      size="sm"
                    >
                      {startingInterview ? (
                        <>
                          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                          Starting...
                        </>
                      ) : (
                        <>
                          <Target className="mr-1 h-3 w-3" />
                          Interview Mode
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Footer */}
          <footer className="mt-12 pt-6 pb-6 border-t text-center text-xs text-muted-foreground">
            <p className="mb-2">
              Built to help developers explain their projects better
            </p>
          </footer>
          </div>
        </div>
      </div>
      <Toaster position="top-right" richColors />
    </>
  )
}
