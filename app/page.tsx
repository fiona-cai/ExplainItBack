'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Copy, Check, Loader2, Upload, Github, FileText, AlertCircle } from 'lucide-react'

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
    <div className="min-h-screen bg-background py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-foreground mb-2">ExplainItBack</h1>
          <p className="text-muted-foreground">Transform your project into clear explanations, resume bullets, and interview pitches</p>
        </div>

        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Project Input</CardTitle>
            <CardDescription>Choose how you'd like to provide your project information</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit}>
              <Tabs value={inputMethod} onValueChange={(value) => {
                setInputMethod(value as InputMethod)
                setError(null)
              }} className="w-full">
                <TabsList className="grid w-full grid-cols-3 mb-6">
                  <TabsTrigger value="github" className="flex items-center gap-2">
                    <Github className="h-4 w-4" />
                    GitHub Repo
                  </TabsTrigger>
                  <TabsTrigger value="text" className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Text Description
                  </TabsTrigger>
                  <TabsTrigger value="upload" className="flex items-center gap-2">
                    <Upload className="h-4 w-4" />
                    Upload Project
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="github" className="space-y-4">
                  <div className="space-y-2">
                    <label htmlFor="githubUrl" className="text-sm font-medium">
                      GitHub Repository URL
                    </label>
                    <Input
                      id="githubUrl"
                      type="url"
                      value={githubUrl}
                      onChange={(e) => setGithubUrl(e.target.value)}
                      placeholder="https://github.com/username/repo"
                      required
                    />
                    <p className="text-sm text-muted-foreground">
                      Paste the full GitHub repository URL. We'll fetch the README and repository information.
                    </p>
                  </div>
                </TabsContent>

                <TabsContent value="text" className="space-y-4">
                  <div className="space-y-2">
                    <label htmlFor="description" className="text-sm font-medium">
                      Project Description
                    </label>
                    <Textarea
                      id="description"
                      rows={8}
                      value={projectDescription}
                      onChange={(e) => setProjectDescription(e.target.value)}
                      placeholder="Paste your raw project description here..."
                      required
                    />
                  </div>
                </TabsContent>

                <TabsContent value="upload" className="space-y-4">
                  <div className="space-y-2">
                    <label htmlFor="fileUpload" className="text-sm font-medium">
                      Upload Project Files
                    </label>
                    <div className="flex justify-center px-6 pt-5 pb-6 border-2 border-dashed rounded-md hover:border-primary/50 transition-colors">
                      <div className="space-y-1 text-center">
                        <Upload className="mx-auto h-12 w-12 text-muted-foreground" />
                        <div className="flex text-sm text-muted-foreground">
                          <label
                            htmlFor="fileUpload"
                            className="relative cursor-pointer rounded-md font-medium text-primary hover:text-primary/80 focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2"
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
                        <p className="text-xs text-muted-foreground">ZIP, TAR, or TAR.GZ up to 50MB</p>
                        {uploadedFile && (
                          <p className="text-sm text-green-600 mt-2 flex items-center justify-center gap-1">
                            <Check className="h-4 w-4" />
                            {uploadedFile.name}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                <div className="space-y-2">
                  <label htmlFor="audience" className="text-sm font-medium">
                    Audience
                  </label>
                  <Select value={audience} onValueChange={(value) => setAudience(value as typeof audience)}>
                    <SelectTrigger id="audience">
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
                    <SelectTrigger id="tone">
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

              <Button type="submit" disabled={loading} className="w-full" size="lg">
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  'Explain My Project'
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {loading && (
          <Card className="p-8 text-center">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary mb-4" />
            <p className="text-muted-foreground">Generating your explanations...</p>
          </Card>
        )}

        {output && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Technical Explanation</CardTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(output.technicalExplanation, 'technical')}
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
                <p className="text-foreground leading-relaxed whitespace-pre-wrap">{output.technicalExplanation}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Resume Bullet</CardTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(output.resumeBullet, 'resume')}
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
                <p className="text-foreground leading-relaxed">{output.resumeBullet}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Interview Pitch</CardTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(output.interviewPitch, 'pitch')}
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
                <p className="text-foreground leading-relaxed whitespace-pre-wrap">{output.interviewPitch}</p>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}
