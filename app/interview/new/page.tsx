'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, Github, Code2, MessageSquare } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export default function NewInterviewPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  const repoUrl = searchParams.get('repoUrl');
  const repoId = searchParams.get('repoId');

  useEffect(() => {
    if (!repoUrl) {
      toast.error('Repository URL is required');
      router.push('/');
      return;
    }

    const createSession = async () => {
      try {
        const response = await fetch('/api/interview/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            repoUrl,
            repoId: repoId || repoUrl,
          }),
        });

        const data = await response.json();

        if (data.success && data.sessionId) {
          // Replace the current URL so back button works correctly
          router.replace(`/interview/${data.sessionId}`);
        } else {
          setError(data.error || 'Failed to start interview');
          toast.error(data.error || 'Failed to start interview mode');
        }
      } catch (err) {
        console.error('Failed to create session:', err);
        setError('Failed to start interview mode');
        toast.error('Failed to start interview mode');
      }
    };

    createSession();
  }, [repoUrl, repoId, router]);

  if (error) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-destructive">{error}</p>
        <button
          onClick={() => router.push('/')}
          className="text-primary underline"
        >
          Go back home
        </button>
      </div>
    );
  }

  // Extract repo name for display
  const repoName = repoUrl
    ? repoUrl.replace('https://github.com/', '').replace(/\.git$/, '')
    : 'Loading...';

  return (
    <div className="h-screen flex flex-col">
      {/* Header Skeleton */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-background">
        <div className="flex items-center gap-3">
          <Github className="h-5 w-5" />
          <h1 className="font-semibold">Interview Mode</h1>
          <span className="text-sm text-muted-foreground">-</span>
          <span className="text-sm font-mono text-muted-foreground">
            {repoName}
          </span>
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Starting session...
          </span>
        </div>
      </header>

      {/* Split screen layout with skeletons */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left side - Chat Skeleton */}
        <div className="w-1/2 border-r border-border flex flex-col">
          <div className="flex-1 p-4 space-y-4">
            {/* Welcome message skeleton */}
            <div className="flex justify-start">
              <Card className="max-w-[85%] p-4 space-y-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-4 w-64" />
                <Skeleton className="h-4 w-56" />
              </Card>
            </div>

            {/* Loading indicator */}
            <div className="flex items-center gap-2 text-muted-foreground p-4">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Initializing interview...</span>
            </div>
          </div>

          {/* Input skeleton */}
          <div className="border-t border-border p-4">
            <div className="flex gap-2">
              <Skeleton className="flex-1 h-10 rounded-md" />
              <Skeleton className="w-20 h-10 rounded-md" />
            </div>
          </div>
        </div>

        {/* Right side - Code Panel Skeleton */}
        <div className="w-1/2 flex flex-col">
          <div className="flex items-center justify-between p-4 border-b border-border">
            <div className="flex items-center gap-2">
              <Code2 className="h-4 w-4" />
              <Skeleton className="h-5 w-32" />
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-8 w-24" />
              <Skeleton className="h-8 w-24" />
            </div>
          </div>

          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8">
            <Code2 className="h-16 w-16 mb-4 opacity-30" />
            <p className="text-center">
              Code snippets will appear here as you answer questions.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
