'use client';

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronRight, Code2, FileCode } from 'lucide-react';
import { AnnotatedCode } from './AnnotatedCode';
import { cn } from '@/lib/utils';
import type { CodeSnippet } from '@/types/interview';

interface CodePanelProps {
  snippets: CodeSnippet[];
  title?: string;
}

export function CodePanel({ snippets, title = 'Related Code' }: CodePanelProps) {
  const [expandedSnippets, setExpandedSnippets] = useState<Set<string>>(
    new Set(snippets.slice(0, 1).map((s) => s.id))
  );
  const prevSnippetIdsRef = useRef<string>('');

  // Update expanded state when snippets change (e.g., new question)
  useEffect(() => {
    const currentIds = snippets.map(s => s.id).join(',');
    if (currentIds !== prevSnippetIdsRef.current && snippets.length > 0) {
      // Auto-expand first snippet when new snippets arrive
      setExpandedSnippets(new Set(snippets.slice(0, 1).map((s) => s.id)));
      prevSnippetIdsRef.current = currentIds;
    }
  }, [snippets]);

  const toggleSnippet = (id: string) => {
    setExpandedSnippets((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const expandAll = () => {
    setExpandedSnippets(new Set(snippets.map((s) => s.id)));
  };

  const collapseAll = () => {
    setExpandedSnippets(new Set());
  };

  if (snippets.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-8">
        <Code2 className="h-16 w-16 mb-4 opacity-30" />
        <p className="text-center">
          Code snippets will appear here as you answer questions.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between p-4 border-b border-border">
        <h2 className="font-semibold flex items-center gap-2">
          <FileCode className="h-4 w-4" />
          {title}
        </h2>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={expandAll}>
            Expand All
          </Button>
          <Button variant="ghost" size="sm" onClick={collapseAll}>
            Collapse All
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {snippets.map((snippet) => {
          const isExpanded = expandedSnippets.has(snippet.id);

          return (
            <Card key={snippet.id} className="overflow-hidden">
              <CardHeader
                className={cn(
                  'p-3 cursor-pointer hover:bg-muted/50 transition-colors',
                  isExpanded && 'border-b border-border'
                )}
                onClick={() => toggleSnippet(snippet.id)}
              >
                <CardTitle className="text-sm flex items-center gap-2">
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                  <span className="font-mono">{snippet.file}</span>
                  <span className="text-muted-foreground font-normal">
                    ({snippet.endLine - snippet.startLine + 1} lines)
                  </span>
                  {snippet.annotations.length > 0 && (
                    <span className="text-xs bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 px-2 py-0.5 rounded">
                      {snippet.annotations.length} annotations
                    </span>
                  )}
                </CardTitle>
              </CardHeader>

              {isExpanded && (
                <CardContent className="p-0">
                  <AnnotatedCode snippet={snippet} />
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
