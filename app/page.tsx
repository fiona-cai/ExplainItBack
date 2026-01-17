'use client'

import { useState, useCallback, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Toaster } from '@/components/ui/toaster'
import { toast } from 'sonner'
import { 
  Copy, 
  Check, 
  Loader2, 
  Upload, 
  Github, 
  FileText, 
  AlertCircle, 
  X, 
  Sparkles,
  Lightbulb,
  Zap
} from 'lucide-react'

interface Output {
  technicalExplanation: string
  resumeBullet: string
  interviewPitch: string
}

type InputMethod = 'text' | 'github' | 'upload'

const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB

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
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const validateInput = (): boolean => {
    if (inputMethod === 'github') {
      if (!githubUrl.trim()) {
        setError('Please enter a GitHub repository URL')
        toast.error('GitHub URL is required')
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
    } else if (inputMethod === 'text') {
      if (!projectDescription.trim()) {
        setError('Please enter a project description')
        toast.error('Project description is required')
        return false
      }
      if (projectDescription.trim().length < 20) {
        setError('Project description should be at least 20 characters')
        toast.error('Description too short. Please provide more details.')
        return false
      }
    } else if (inputMethod === 'upload') {
      if (!uploadedFile) {
        setError('Please upload a project file')
        toast.error('File upload is required')
        return false
      }
    }
    return true
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!validateInput()) {
      return
    }

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
      toast.success('Explanations generated successfully!')
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred'
      setError(errorMessage)
      toast.error(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (file.size > MAX_FILE_SIZE) {
        toast.error(`File size exceeds 50MB limit. Your file is ${(file.size / 1024 / 1024).toFixed(2)}MB`)
        setError(`File size exceeds 50MB limit`)
        return
      }
      setUploadedFile(file)
      setError(null)
      toast.success(`File "${file.name}" uploaded successfully`)
    }
  }

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (inputMethod === 'upload') {
      setIsDragging(true)
    }
  }, [inputMethod])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    if (inputMethod !== 'upload') return

    const file = e.dataTransfer.files[0]
    if (file) {
      if (file.size > MAX_FILE_SIZE) {
        toast.error(`File size exceeds 50MB limit. Your file is ${(file.size / 1024 / 1024).toFixed(2)}MB`)
        setError(`File size exceeds 50MB limit`)
        return
      }
      setUploadedFile(file)
      setError(null)
      toast.success(`File "${file.name}" uploaded successfully`)
    }
  }, [inputMethod])

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
    setProjectDescription('')
    setGithubUrl('')
    setUploadedFile(null)
    setOutput(null)
    setError(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
    toast.info('Form cleared')
  }

  const loadExample = () => {
    const example = `A full-stack web application built with React and Node.js that helps users manage their daily tasks. Features include user authentication, real-time task synchronization, drag-and-drop task organization, and calendar integration. The frontend uses React with TypeScript and Tailwind CSS for styling, while the backend is built with Express.js and MongoDB for data storage. The app includes features like task categories, due dates, reminders, and collaborative task sharing.`
    setProjectDescription(example)
    setInputMethod('text')
    toast.info('Example loaded! You can edit it or submit as-is.')
  }

  return (
    <>
      <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
          {/* Header */}
          <div className="text-center mb-8 sm:mb-12 space-y-3">
            <div className="flex items-center justify-center gap-2">
              <Sparkles className="h-8 w-8 text-primary" />
              <h1 className="text-4xl sm:text-5xl font-bold text-foreground bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">
                ExplainItBack
              </h1>
            </div>
            <p className="text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto">
              Transform your project into clear explanations, resume bullets, and interview pitches
            </p>
          </div>

          {/* Main Card */}
          <Card className="mb-6 shadow-lg border-2">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-2xl">Project Input</CardTitle>
                  <CardDescription className="mt-1">
                    Choose how you'd like to provide your project information
                  </CardDescription>
                </div>
                {(projectDescription || githubUrl || uploadedFile || output) && (
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
              <form onSubmit={handleSubmit}>
                <Tabs 
                  value={inputMethod} 
                  onValueChange={(value) => {
                    setInputMethod(value as InputMethod)
                    setError(null)
                  }} 
                  className="w-full"
                >
                  <TabsList className="grid w-full grid-cols-3 mb-6 h-11">
                    <TabsTrigger value="github" className="flex items-center gap-2 text-sm sm:text-base">
                      <Github className="h-4 w-4" />
                      <span className="hidden sm:inline">GitHub Repo</span>
                      <span className="sm:hidden">GitHub</span>
                    </TabsTrigger>
                    <TabsTrigger value="text" className="flex items-center gap-2 text-sm sm:text-base">
                      <FileText className="h-4 w-4" />
                      <span className="hidden sm:inline">Text Description</span>
                      <span className="sm:hidden">Text</span>
                    </TabsTrigger>
                    <TabsTrigger value="upload" className="flex items-center gap-2 text-sm sm:text-base">
                      <Upload className="h-4 w-4" />
                      <span className="hidden sm:inline">Upload Project</span>
                      <span className="sm:hidden">Upload</span>
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="github" className="space-y-4 mt-6">
                    <div className="space-y-2">
                      <label htmlFor="githubUrl" className="text-sm font-medium flex items-center gap-2">
                        <Github className="h-4 w-4" />
                        GitHub Repository URL
                      </label>
                      <Input
                        id="githubUrl"
                        type="url"
                        value={githubUrl}
                        onChange={(e) => setGithubUrl(e.target.value)}
                        placeholder="https://github.com/username/repo"
                        className="text-base"
                        required
                      />
                      <p className="text-sm text-muted-foreground">
                        Paste the full GitHub repository URL. We'll fetch the README and repository information.
                      </p>
                    </div>
                  </TabsContent>

                  <TabsContent value="text" className="space-y-4 mt-6">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label htmlFor="description" className="text-sm font-medium flex items-center gap-2">
                          <FileText className="h-4 w-4" />
                          Project Description
                        </label>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={loadExample}
                          className="text-xs h-7"
                        >
                          <Lightbulb className="h-3 w-3 mr-1" />
                          Load Example
                        </Button>
                      </div>
                      <Textarea
                        id="description"
                        rows={10}
                        value={projectDescription}
                        onChange={(e) => setProjectDescription(e.target.value)}
                        placeholder="Paste your raw project description here... Be as detailed as possible for best results."
                        className="text-base resize-y min-h-[200px]"
                        required
                      />
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{projectDescription.length} characters</span>
                        {projectDescription.length > 0 && projectDescription.length < 20 && (
                          <span className="text-destructive">At least 20 characters recommended</span>
                        )}
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="upload" className="space-y-4 mt-6">
                    <div className="space-y-2">
                      <label htmlFor="fileUpload" className="text-sm font-medium flex items-center gap-2">
                        <Upload className="h-4 w-4" />
                        Upload Project Files
                      </label>
                      <div
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        className={`flex justify-center px-6 pt-8 pb-8 border-2 border-dashed rounded-lg transition-all cursor-pointer ${
                          isDragging
                            ? 'border-primary bg-primary/5 scale-[1.02]'
                            : 'border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50'
                        }`}
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <div className="space-y-3 text-center">
                          <Upload className={`mx-auto h-12 w-12 transition-colors ${
                            isDragging ? 'text-primary' : 'text-muted-foreground'
                          }`} />
                          <div className="flex flex-col sm:flex-row items-center justify-center gap-1 text-sm text-muted-foreground">
                            <span className="font-medium text-primary">Click to upload</span>
                            <span className="hidden sm:inline">or drag and drop</span>
                            <span className="sm:hidden">or drag here</span>
                          </div>
                          <p className="text-xs text-muted-foreground">ZIP, TAR, or TAR.GZ up to 50MB</p>
                          {uploadedFile && (
                            <div className="mt-3 p-2 bg-green-500/10 border border-green-500/20 rounded-md">
                              <p className="text-sm text-green-600 dark:text-green-400 flex items-center justify-center gap-2">
                                <Check className="h-4 w-4" />
                                {uploadedFile.name}
                                <span className="text-xs text-muted-foreground">
                                  ({(uploadedFile.size / 1024 / 1024).toFixed(2)} MB)
                                </span>
                              </p>
                            </div>
                          )}
                        </div>
                        <input
                          ref={fileInputRef}
                          id="fileUpload"
                          name="fileUpload"
                          type="file"
                          className="hidden"
                          onChange={handleFileChange}
                          accept=".zip,.tar,.tar.gz"
                          required={inputMethod === 'upload'}
                        />
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6 mt-6">
                  <div className="space-y-2">
                    <label htmlFor="audience" className="text-sm font-medium">
                      Target Audience
                    </label>
                    <Select value={audience} onValueChange={(value) => setAudience(value as typeof audience)}>
                      <SelectTrigger id="audience" className="h-11">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="recruiter">Recruiter</SelectItem>
                        <SelectItem value="engineer">Engineer</SelectItem>
                        <SelectItem value="non-technical">Non-Technical</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="tone" className="text-sm font-medium">
                      Tone
                    </label>
                    <Select value={tone} onValueChange={(value) => setTone(value as typeof tone)}>
                      <SelectTrigger id="tone" className="h-11">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="concise">Concise</SelectItem>
                        <SelectItem value="confident">Confident</SelectItem>
                        <SelectItem value="technical">Technical</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Button 
                  type="submit" 
                  disabled={loading} 
                  className="w-full h-12 text-base font-semibold shadow-lg hover:shadow-xl transition-all" 
                  size="lg"
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Zap className="mr-2 h-5 w-5" />
                      Explain My Project
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Error Alert */}
          {error && (
            <Alert variant="destructive" className="mb-6 animate-in slide-in-from-top-2">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Loading State */}
          {loading && (
            <Card className="p-12 text-center shadow-lg animate-in fade-in-50">
              <Loader2 className="mx-auto h-12 w-12 animate-spin text-primary mb-4" />
              <p className="text-lg font-medium text-foreground mb-2">Generating your explanations...</p>
              <p className="text-sm text-muted-foreground">This may take a few moments</p>
            </Card>
          )}

          {/* Output Cards */}
          {output && (
            <div className="space-y-6 animate-in slide-in-from-bottom-4">
              <div className="text-center mb-4">
                <h2 className="text-2xl font-bold text-foreground mb-2">Your Results</h2>
                <p className="text-muted-foreground">Copy any section to use in your resume or interviews</p>
              </div>

              <Card className="shadow-lg hover:shadow-xl transition-shadow">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="h-5 w-5" />
                      Technical Explanation
                    </CardTitle>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(output.technicalExplanation, 'technical')}
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
                </CardHeader>
                <CardContent>
                  <p className="text-foreground leading-relaxed whitespace-pre-wrap text-base">
                    {output.technicalExplanation}
                  </p>
                </CardContent>
              </Card>

              <Card className="shadow-lg hover:shadow-xl transition-shadow">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <Zap className="h-5 w-5" />
                      Resume Bullet
                    </CardTitle>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(output.resumeBullet, 'resume')}
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
                </CardHeader>
                <CardContent>
                  <p className="text-foreground leading-relaxed text-lg font-medium">
                    {output.resumeBullet}
                  </p>
                </CardContent>
              </Card>

              <Card className="shadow-lg hover:shadow-xl transition-shadow">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <Sparkles className="h-5 w-5" />
                      Interview Pitch
                    </CardTitle>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(output.interviewPitch, 'pitch')}
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
                </CardHeader>
                <CardContent>
                  <p className="text-foreground leading-relaxed whitespace-pre-wrap text-base">
                    {output.interviewPitch}
                  </p>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Footer */}
          <footer className="mt-16 pt-8 border-t text-center text-sm text-muted-foreground">
            <p className="mb-2">
              Made with <span className="text-destructive">♥</span> to help developers explain their projects better
            </p>
            <p className="text-xs">
              Powered by OpenAI GPT-4o-mini
            </p>
          </footer>
        </div>
      </div>
      <Toaster position="top-right" richColors />
    </>
  )
}
