'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { LogOut, Loader2, Github, RefreshCw } from 'lucide-react';
import { InterviewChat } from './InterviewChat';
import { CodePanel } from './CodePanel';
import type {
  InterviewSession,
  ChatMessage,
  CodeSnippet,
  Question,
} from '@/types/interview';

interface InterviewLayoutProps {
  sessionId: string;
}

export function InterviewLayout({ sessionId }: InterviewLayoutProps) {
  const router = useRouter();
  const [session, setSession] = useState<InterviewSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [codeSnippets, setCodeSnippets] = useState<CodeSnippet[]>([]);
  const [hintCount, setHintCount] = useState(0);

  const fetchSession = useCallback(async () => {
    try {
      const response = await fetch(`/api/interview/session?sessionId=${sessionId}`);
      const data = await response.json();

      if (data.success && data.session) {
        setSession(data.session);

        // Update code snippets from current question
        if (data.session.currentQuestion?.codeSnippets) {
          setCodeSnippets(data.session.currentQuestion.codeSnippets);
        }
      } else {
        toast.error('Session not found');
        router.push('/');
      }
    } catch (error) {
      console.error('Failed to fetch session:', error);
      toast.error('Failed to load session');
    } finally {
      setIsLoading(false);
    }
  }, [sessionId, router]);

  useEffect(() => {
    fetchSession();

    // Poll for updates every 3 seconds
    const interval = setInterval(fetchSession, 3000);
    return () => clearInterval(interval);
  }, [fetchSession]);

  const handleSendMessage = async (content: string) => {
    if (!session) return;

    setIsProcessing(true);

    try {
      // Check if this is a directory selection
      if (session.status === 'selecting_dirs') {
        await handleDirectorySelection(content);
        return;
      }

      // Check if user is requesting a hint
      if (content.toLowerCase() === 'hint' && session.currentQuestion) {
        await requestHint();
        return;
      }

      // Otherwise, treat as an answer
      if (session.currentQuestion) {
        await submitAnswer(content);
      } else {
        // No current question, maybe they want a new one
        if (content.toLowerCase().includes('next') || content.toLowerCase().includes('question')) {
          await requestNewQuestion();
        }
      }
    } catch (error) {
      console.error('Error processing message:', error);
      toast.error('Failed to process message');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDirectorySelection = async (input: string) => {
    const isEntireRepo =
      input.toLowerCase().includes('entire') ||
      input.toLowerCase().includes('all') ||
      input.toLowerCase() === 'full';

    const directories = isEntireRepo
      ? []
      : input
          .split(/[,\n]/)
          .map((d) => d.trim())
          .filter(Boolean);

    try {
      // First, update directories
      const dirResponse = await fetch('/api/interview/session', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          directories,
        }),
      });

      if (!dirResponse.ok) {
        throw new Error('Failed to update directories');
      }

      toast.success('Analyzing repository...');

      // Then trigger analysis
      const analyzeResponse = await fetch('/api/interview/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          directories,
        }),
      });

      const analyzeData = await analyzeResponse.json();

      if (analyzeData.success) {
        toast.success('Analysis complete! Generating first question...');

        // Request first question
        await requestNewQuestion();
      } else {
        toast.error(analyzeData.error || 'Analysis failed');
      }
    } catch (error) {
      console.error('Directory selection error:', error);
      toast.error('Failed to start analysis');
    }
  };

  const submitAnswer = async (answer: string) => {
    if (!session?.currentQuestion) return;

    try {
      const response = await fetch('/api/interview/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          answer,
          questionId: session.currentQuestion.id,
        }),
      });

      const data = await response.json();

      if (data.success) {
        // Update code snippets with any from the evaluation
        if (data.codeSnippets) {
          setCodeSnippets(data.codeSnippets);
        }

        // Reset hint count for next question
        setHintCount(0);

        // Fetch updated session
        await fetchSession();

        // Auto-request next question after a delay
        setTimeout(() => {
          requestNewQuestion();
        }, 2000);
      } else {
        toast.error(data.error || 'Failed to evaluate answer');
      }
    } catch (error) {
      console.error('Answer submission error:', error);
      toast.error('Failed to submit answer');
    }
  };

  const requestNewQuestion = async () => {
    try {
      const response = await fetch('/api/interview/question', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });

      const data = await response.json();

      if (data.success && data.question) {
        // Update code snippets
        if (data.question.codeSnippets) {
          setCodeSnippets(data.question.codeSnippets);
        }

        // Fetch updated session
        await fetchSession();
      } else {
        toast.error(data.error || 'Failed to generate question');
      }
    } catch (error) {
      console.error('Question request error:', error);
      toast.error('Failed to get new question');
    }
  };

  const requestHint = async () => {
    if (!session?.currentQuestion) return;

    try {
      const response = await fetch('/api/interview/hint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          questionId: session.currentQuestion.id,
          hintLevel: hintCount + 1,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setHintCount((prev) => Math.min(prev + 1, 3));
        await fetchSession();
      } else {
        toast.error(data.error || 'Failed to get hint');
      }
    } catch (error) {
      console.error('Hint request error:', error);
      toast.error('Failed to get hint');
    }
  };

  const endSession = async () => {
    try {
      const response = await fetch(`/api/interview/session?sessionId=${sessionId}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (data.success) {
        toast.success('Session ended');
        router.push('/');
      } else {
        toast.error(data.error || 'Failed to end session');
      }
    } catch (error) {
      console.error('End session error:', error);
      toast.error('Failed to end session');
    }
  };

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Session not found</p>
      </div>
    );
  }

  const repoName = session.repoUrl.split('/').slice(-2).join('/');

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-background">
        <div className="flex items-center gap-3">
          <Github className="h-5 w-5" />
          <h1 className="font-semibold">Interview Mode</h1>
          <span className="text-sm text-muted-foreground">-</span>
          <span className="text-sm font-mono text-muted-foreground">
            {repoName}
          </span>
          {session.status === 'analyzing' && (
            <span className="flex items-center gap-1 text-sm text-muted-foreground">
              <RefreshCw className="h-3 w-3 animate-spin" />
              Analyzing...
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            Questions: {session.questionsAsked.length}
          </span>
          <Button variant="destructive" size="sm" onClick={endSession}>
            <LogOut className="h-4 w-4 mr-2" />
            End Session
          </Button>
        </div>
      </header>

      {/* Split screen layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left side - Chat */}
        <div className="w-1/2 border-r border-border">
          <InterviewChat
            messages={session.messages}
            onSendMessage={handleSendMessage}
            onRequestHint={requestHint}
            isLoading={isProcessing}
            showHintButton={
              session.status === 'active' && !!session.currentQuestion && hintCount < 3
            }
            inputPlaceholder={
              session.status === 'selecting_dirs'
                ? 'Enter directories to focus on, or type "all" for entire repo...'
                : session.currentQuestion
                ? 'Type your answer... (or type "hint" for a hint)'
                : 'Type "next" for a new question...'
            }
            disabled={session.status === 'ended' || session.status === 'analyzing'}
          />
        </div>

        {/* Right side - Code */}
        <div className="w-1/2 overflow-hidden">
          <CodePanel
            snippets={codeSnippets}
            title={
              session.currentQuestion
                ? `Code for: ${session.currentQuestion.relatedFiles[0] || 'Question'}`
                : 'Related Code'
            }
          />
        </div>
      </div>
    </div>
  );
}
