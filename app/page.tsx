'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Toaster } from '@/components/ui/toaster'
import { toast } from 'sonner'
import { 
  Copy, 
  Check, 
  Loader2, 
  Github, 
  FileText,
  AlertCircle, 
  X,
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
  const [githubUrl, setGithubUrl] = useState('')
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

  const validateInput = (): boolean => {
    if (!githubUrl.trim()) {
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
      const url = new URL(githubUrl)
      if (!url.hostname.includes('github.com')) {
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
    if (!githubUrl.trim()) {
      setError('Please enter a GitHub repository URL')
      toast.error('GitHub URL is required')
      return
    }

    try {
      const url = new URL(githubUrl)
      if (!url.hostname.includes('github.com')) {
        setError('Please enter a valid GitHub repository URL')
        toast.error('Invalid GitHub URL')
        return
      }
    } catch {
      setError('Please enter a valid URL')
      toast.error('Invalid URL format')
      return
    }

    setFetchingGithub(true)
    setError(null)

    try {
      // Parse the GitHub URL
      const urlObj = new URL(githubUrl)
      const parts = urlObj.pathname.split('/').filter(Boolean)
      if (parts.length < 2) {
        throw new Error('Invalid GitHub URL format')
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
      const response = await fetch('/api/explain', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectDescription: githubUrl,
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

  const clearAll = () => {
    setGithubUrl('')
    setGithubRepoInfo(null)
    setOutput(null)
    setError(null)
    toast.info('Form cleared')
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
      <div className="min-h-screen bg-background">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
          {/* Header */}
          <div className="text-center mb-8 sm:mb-12 space-y-4 fade-in-up overflow-visible">
            <h1 className="text-4xl sm:text-5xl font-bold text-foreground raleway fade-in-up leading-tight pt-2 pb-1">
              ExplainIt<span className="italic font-light">Back.</span>
            </h1>
            <div className="space-y-2">
              <p className="text-sm sm:text-base text-muted-foreground max-w-2xl mx-auto fade-in-up" style={{ animationDelay: '0.1s' }}>
                git explain &lt;repository_url&gt;
              </p>
            </div>
          </div>

          {/* Summary */}
          <Card className="border-2 mb-8 fade-in-up" style={{ animationDelay: '0.15s' }}>
            <CardContent className="pt-6">
              <div className="space-y-4">
                <h2 className="text-lg font-semibold text-foreground">What you'll get</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Award className="h-5 w-5 text-foreground" />
                      <h3 className="font-medium text-foreground">Resume Bullets</h3>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Action-oriented bullet points highlighting technologies and impact, ready for your resume and LinkedIn.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <MessageSquare className="h-5 w-5 text-foreground" />
                      <h3 className="font-medium text-foreground">Interview Pitch</h3>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      A concise explanation perfect for "Tell me about a project" questions, tailored to your audience.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <FileText className="h-5 w-5 text-foreground" />
                      <h3 className="font-medium text-foreground">Technical Explanation</h3>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Deep dive into architecture, tools, and implementation details for technical discussions.
                    </p>
                  </div>
                </div>
                <div className="pt-2 border-t">
                  <p className="text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">How it works:</span> We analyze your repository's code, structure, and documentation to generate professional explanations tailored to your chosen audience (Recruiter, Engineer, Hiring Manager, or Founder/Product) and tone.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Input Form */}
          <form onSubmit={handleSubmit} className="space-y-6 mb-6">
            <Card className="border-2 card-lift fade-in-up" style={{ animationDelay: '0.1s' }}>
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-xl">GitHub Repository</CardTitle>
                    <CardDescription className="mt-0.5">
                      Enter your repository URL
                    </CardDescription>
                  </div>
                  {(githubUrl || output) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={clearAll}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-4 w-4 mr-2" />
                      Clear
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label htmlFor="githubUrl" className="text-sm font-medium flex items-center gap-2">
                      <Github className="h-4 w-4" />
                      GitHub URL
                    </label>
                    <div className="flex gap-2">
                      <Input
                        id="githubUrl"
                        type="url"
                        value={githubUrl}
                        onChange={(e) => {
                          setGithubUrl(e.target.value)
                          setGithubRepoInfo(null)
                        }}
                        placeholder="https://github.com/username/repo"
                        className="text-base fade-in-up transition-all focus:ring-2 focus:ring-foreground/50 flex-1"
                        style={{ animationDelay: '0.2s' }}
                        required
                      />
                      <Button
                        type="button"
                        onClick={handleFetchGithub}
                        disabled={fetchingGithub || !githubUrl.trim()}
                        className="shrink-0"
                      >
                        {fetchingGithub ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Fetching...
                          </>
                        ) : (
                          <>
                            <Github className="mr-2 h-4 w-4" />
                            Fetch
                          </>
                        )}
                      </Button>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Paste GitHub URL and click Fetch
                    </p>
                  </div>

                  {githubRepoInfo && (
                    <div className="p-4 bg-muted border border-foreground/20 rounded-lg fade-in-up">
                      <div className="flex items-start gap-3">
                        <Check className="h-5 w-5 text-foreground mt-0.5 shrink-0" />
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center gap-2">
                            <h4 className="font-semibold text-foreground">
                              {githubRepoInfo.owner}/{githubRepoInfo.name}
                            </h4>
                            {githubRepoInfo.stars > 0 && (
                              <span className="text-sm text-muted-foreground flex items-center gap-1">
                                <span>⭐</span>
                                {githubRepoInfo.stars.toLocaleString()}
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {githubRepoInfo.description}
                          </p>
                          <p className="text-xs text-foreground">
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
            <Card className="border-2 card-lift fade-in-up" style={{ animationDelay: '0.2s' }}>
              <CardHeader className="pb-4">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-foreground text-background font-bold text-sm">
                    2
                  </div>
                  <div>
                    <CardTitle className="text-xl">Configure Output</CardTitle>
                    <CardDescription className="mt-0.5">
                      Set audience and tone
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div className="space-y-3">
                      <div>
                        <label htmlFor="audience" className="text-sm font-semibold flex items-center gap-2 mb-2">
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
                        <label htmlFor="tone" className="text-sm font-semibold flex items-center gap-2 mb-2">
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
                    className="w-full h-12 text-base font-semibold  transition-all mt-6 " 
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

          {/* Error Alert */}
          {error && (
            <Alert variant="destructive" className="mb-6 fade-in-up">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Loading State with Blurred Preview */}
          {loading && (
            <div className="mt-12 space-y-6 fade-in-up">
              <div className="relative mb-6 fade-in-up" style={{ animationDelay: '0.1s' }}>
                <div className="text-center mb-2">
                  <h2 className="text-2xl font-bold text-foreground gradient-text">Your Results</h2>
                </div>
                <div className="absolute top-0 right-0">
                  <div className="cool-spinner">
                    <div className="cool-spinner-inner"></div>
                  </div>
                </div>
                <p className="text-center text-muted-foreground">Ready to use in your resume, interviews, and applications</p>
                {progress?.filesFetched !== undefined && (
                  <p className="text-center text-xs text-muted-foreground mt-2">
                    Fetched {progress.filesFetched} file{progress.filesFetched !== 1 ? 's' : ''}
                    {progress.tokens !== undefined && (
                      <span className="ml-2">(~{progress.tokens.toLocaleString()} tokens)</span>
                    )}
                  </p>
                )}
              </div>

              {/* Blurred Resume Bullets Preview */}
              <Card className="border-l-[4px] border-l-foreground card-lift fade-in-up blur-sm pointer-events-none" style={{ animationDelay: '0.2s' }}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-muted">
                        <Award className="h-5 w-5 text-foreground" />
                      </div>
                      <div>
                        <CardTitle className="text-xl">Resume Bullets</CardTitle>
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
              <Card className="border-l-4 border-l-foreground card-lift fade-in-up blur-sm pointer-events-none" style={{ animationDelay: '0.3s' }}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-muted">
                        <MessageSquare className="h-5 w-5 text-foreground" />
                      </div>
                      <div>
                        <CardTitle className="text-xl">Interview Pitch</CardTitle>
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
              <Card className=" border-l-4 border-l-foreground card-lift fade-in-up  blur-sm pointer-events-none" style={{ animationDelay: '0.4s' }}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-muted">
                        <FileText className="h-5 w-5 text-foreground" />
                      </div>
                      <div>
                        <CardTitle className="text-xl">Technical Explanation</CardTitle>
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
            <Alert className="mb-6 fade-in-up" variant="default">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-sm text-muted-foreground">
                <span>
                  Requests remaining: <strong>{rateLimitInfo.remaining}</strong>
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
            <div className="space-y-6 fade-in-up mt-12" style={{ animationDelay: '0.1s' }}>
              <div className="relative mb-6 fade-in-up" style={{ animationDelay: '0.2s' }}>
                <div className="text-center mb-2">
                  <h2 className="text-2xl font-bold text-foreground gradient-text">Your Results</h2>
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
                  className="absolute top-0 right-0 shrink-0 transition-all"
                >
                  {copied === 'all' ? (
                    <>
                      <Check className="mr-2 h-4 w-4" />
                      Copied All
                    </>
                  ) : (
                    <>
                      <Copy className="mr-2 h-4 w-4" />
                      Copy All Results
                    </>
                  )}
                </Button>
                <p className="text-center text-muted-foreground">Ready to use in your resume, interviews, and applications</p>
              </div>

              {/* 1. Resume Bullets - Most actionable, shown first */}
              <Card className="border-l-[4px] border-l-foreground card-lift fade-in-up" style={{ animationDelay: '0.3s' }}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-muted">
                        <Award className="h-5 w-5 text-foreground" />
                      </div>
                      <div>
                        <CardTitle className="text-xl">Resume Bullets</CardTitle>
                        <CardDescription className="mt-0.5">
                          For resumes and applications
                        </CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const content = output.resumeBullets.join('\n')
                            handleRefine(content, 'resume-bullets', 'make-concise')
                          }}
                          disabled={refining?.type === 'resume-bullets'}
                          className="h-8 text-xs hover-scale transition-all"
                        >
                          {refining?.type === 'resume-bullets' && refining.action === 'make-concise' ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            'Make concise'
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
                          className="h-8 text-xs hover-scale transition-all"
                        >
                          {refining?.type === 'resume-bullets' && refining.action === 'add-metrics' ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            'Add metrics'
                          )}
                        </Button>
                        <Select
                          value=""
                          onValueChange={(value: RefineAction) => {
                            const content = output.resumeBullets.join('\n')
                            handleRefine(content, 'resume-bullets', value)
                          }}
                        >
                          <SelectTrigger className="w-[100px] h-8 text-xs" disabled={refining?.type === 'resume-bullets'}>
                            <SelectValue placeholder="More...">
                              {refining?.type === 'resume-bullets' ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                'More...'
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
                        className="shrink-0"
                      >
                        {copied === 'resume' ? (
                          <>
                            <Check className="mr-2 h-4 w-4" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy className="mr-2 h-4 w-4" />
                            Copy
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="fade-in-up" style={{ animationDelay: '0.1s' }}>
                  {refinedContent['resume-bullets'] && (
                    <div className="mb-3 p-2 bg-muted border border-foreground/20 rounded-md flex items-center justify-between">
                      <span className="text-sm text-foreground flex items-center gap-2">
                        <Check className="h-4 w-4" />
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
                        className="h-7 text-xs"
                      >
                        Revert
                      </Button>
                    </div>
                  )}
                  <ul className="text-foreground leading-relaxed text-base font-medium list-disc pl-5 space-y-3">
                    {(getDisplayContent('resume-bullets', output.resumeBullets) as string[]).map((bullet, i) => (
                      <li key={i} className="pl-2">{bullet}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>

              {/* 2. Interview Pitch - Second most actionable */}
              <Card className=" transition-shadow border-l-4 border-l-foreground card-lift fade-in-up " style={{ animationDelay: '0.3s' }}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-muted">
                        <MessageSquare className="h-5 w-5 text-foreground" />
                      </div>
                      <div>
                        <CardTitle className="text-xl">Interview Pitch</CardTitle>
                        <CardDescription className="mt-0.5">
                          Ideal for "Tell me about a project" questions
                        </CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            handleRefine(output.interviewPitch, 'interview-pitch', 'make-concise')
                          }}
                          disabled={refining?.type === 'interview-pitch'}
                          className="h-8 text-xs hover-scale transition-all"
                        >
                          {refining?.type === 'interview-pitch' && refining.action === 'make-concise' ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            'Make concise'
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            handleRefine(output.interviewPitch, 'interview-pitch', 'add-metrics')
                          }}
                          disabled={refining?.type === 'interview-pitch'}
                          className="h-8 text-xs hover-scale transition-all"
                        >
                          {refining?.type === 'interview-pitch' && refining.action === 'add-metrics' ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            'Add metrics'
                          )}
                        </Button>
                        <Select
                          value=""
                          onValueChange={(value: RefineAction) => {
                            handleRefine(output.interviewPitch, 'interview-pitch', value)
                          }}
                        >
                          <SelectTrigger className="w-[100px] h-8 text-xs" disabled={refining?.type === 'interview-pitch'}>
                            <SelectValue placeholder="More...">
                              {refining?.type === 'interview-pitch' ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                'More...'
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
                        className="shrink-0"
                      >
                        {copied === 'pitch' ? (
                          <>
                            <Check className="mr-2 h-4 w-4" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy className="mr-2 h-4 w-4" />
                            Copy
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="fade-in-up" style={{ animationDelay: '0.1s' }}>
                  {refinedContent['interview-pitch'] && (
                    <div className="mb-3 p-2 bg-muted border border-foreground/20 rounded-md flex items-center justify-between">
                      <span className="text-sm text-foreground flex items-center gap-2">
                        <Check className="h-4 w-4" />
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
                        className="h-7 text-xs"
                      >
                        Revert
                      </Button>
                    </div>
                  )}
                  <p className="text-foreground leading-relaxed whitespace-pre-wrap text-base">
                    {getDisplayContent('interview-pitch', output.interviewPitch) as string}
                  </p>
                </CardContent>
              </Card>

              {/* 3. Technical Explanation - Reference material, shown last */}
              <Card className="border-l-4 border-l-foreground card-lift fade-in-up" style={{ animationDelay: '0.5s' }}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-muted">
                        <FileText className="h-5 w-5 text-foreground" />
                      </div>
                      <div>
                        <CardTitle className="text-xl">Technical Explanation</CardTitle>
                        <CardDescription className="mt-0.5">
                          For technical deep dives
                        </CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            handleRefine(output.technicalExplanation, 'technical-explanation', 'make-concise')
                          }}
                          disabled={refining?.type === 'technical-explanation'}
                          className="h-8 text-xs hover-scale transition-all"
                        >
                          {refining?.type === 'technical-explanation' && refining.action === 'make-concise' ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            'Make concise'
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            handleRefine(output.technicalExplanation, 'technical-explanation', 'add-metrics')
                          }}
                          disabled={refining?.type === 'technical-explanation'}
                          className="h-8 text-xs hover-scale transition-all"
                        >
                          {refining?.type === 'technical-explanation' && refining.action === 'add-metrics' ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            'Add metrics'
                          )}
                        </Button>
                        <Select
                          value=""
                          onValueChange={(value: RefineAction) => {
                            handleRefine(output.technicalExplanation, 'technical-explanation', value)
                          }}
                        >
                          <SelectTrigger className="w-[100px] h-8 text-xs" disabled={refining?.type === 'technical-explanation'}>
                            <SelectValue placeholder="More...">
                              {refining?.type === 'technical-explanation' ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                'More...'
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
                        className="shrink-0"
                      >
                        {copied === 'technical' ? (
                          <>
                            <Check className="mr-2 h-4 w-4" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy className="mr-2 h-4 w-4" />
                            Copy
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="fade-in-up" style={{ animationDelay: '0.1s' }}>
                  {refinedContent['technical-explanation'] && (
                    <div className="mb-3 p-2 bg-muted border border-foreground/20 rounded-md flex items-center justify-between">
                      <span className="text-sm text-foreground flex items-center gap-2">
                        <Check className="h-4 w-4" />
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
                        className="h-7 text-xs"
                      >
                        Revert
                      </Button>
                    </div>
                  )}
                  <p className="text-foreground leading-relaxed whitespace-pre-wrap text-base">
                    {getDisplayContent('technical-explanation', output.technicalExplanation) as string}
                  </p>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Footer */}
          <footer className="mt-16 pt-8 border-t text-center text-sm text-muted-foreground">
            <p className="mb-2">
              Built to help developers explain their projects better
            </p>
            <p className="text-xs">
              Optimized for technical resumes and interviews
              <span className="mx-2">•</span>
              <span
                onClick={() => toast.info('Powered by OpenAI GPT-4o-mini')}
                className="underline hover:text-foreground transition-colors cursor-pointer"
                title="Click to see model info"
              >
                About
              </span>
            </p>
          </footer>
        </div>
      </div>
      <Toaster position="top-right" richColors />
    </>
  )
}
