'use client';

import { useState } from 'react';
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
    <div className="h-full flex flex-col min-h-0">
      <div className="flex items-center justify-between p-2 border-b border-border shrink-0">
        <h2 className="text-sm font-semibold flex items-center gap-1.5 truncate">
          <FileCode className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{title}</span>
        </h2>
        <div className="flex gap-1 shrink-0">
          <Button variant="ghost" size="sm" onClick={expandAll} className="h-6 text-xs px-2">
            Expand
          </Button>
          <Button variant="ghost" size="sm" onClick={collapseAll} className="h-6 text-xs px-2">
            Collapse
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-0">
        {snippets.map((snippet) => {
          const isExpanded = expandedSnippets.has(snippet.id);

          return (
            <Card key={snippet.id} className="overflow-hidden">
              <CardHeader
                className={cn(
                  'p-2 cursor-pointer hover:bg-muted/50 transition-colors',
                  isExpanded && 'border-b border-border'
                )}
                onClick={() => toggleSnippet(snippet.id)}
              >
                <CardTitle className="text-xs flex items-center gap-1.5">
                  {isExpanded ? (
                    <ChevronDown className="h-3 w-3 shrink-0" />
                  ) : (
                    <ChevronRight className="h-3 w-3 shrink-0" />
                  )}
                  <span className="font-mono truncate">{snippet.file}</span>
                  <span className="text-muted-foreground font-normal text-xs shrink-0">
                    ({snippet.endLine - snippet.startLine + 1})
                  </span>
                  {snippet.annotations.length > 0 && (
                    <span className="text-xs bg-yellow-500/75 text-yellow-700 dark:text-yellow-400 px-1.5 py-0.5 rounded shrink-0">
                      {snippet.annotations.length}
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
