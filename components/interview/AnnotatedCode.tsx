'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import type { CodeSnippet, Annotation } from '@/types/interview';

interface AnnotatedCodeProps {
  snippet: CodeSnippet;
}

export function AnnotatedCode({ snippet }: AnnotatedCodeProps) {
  const [hoveredLine, setHoveredLine] = useState<number | null>(null);
  const [Prism, setPrism] = useState<typeof import('prismjs') | null>(null);

  useEffect(() => {
    // Dynamically import Prism.js
    const loadPrism = async () => {
      const prism = await import('prismjs');
      // Import language support - using dynamic imports with type assertions
      // @ts-expect-error - Prism components don't have type definitions
      await import('prismjs/components/prism-typescript');
      // @ts-expect-error - Prism components don't have type definitions
      await import('prismjs/components/prism-javascript');
      // @ts-expect-error - Prism components don't have type definitions
      await import('prismjs/components/prism-jsx');
      // @ts-expect-error - Prism components don't have type definitions
      await import('prismjs/components/prism-tsx');
      // @ts-expect-error - Prism components don't have type definitions
      await import('prismjs/components/prism-python');
      // @ts-expect-error - Prism components don't have type definitions
      await import('prismjs/components/prism-go');
      // @ts-expect-error - Prism components don't have type definitions
      await import('prismjs/components/prism-rust');
      // @ts-expect-error - Prism components don't have type definitions
      await import('prismjs/components/prism-java');
      // @ts-expect-error - Prism components don't have type definitions
      await import('prismjs/components/prism-css');
      // @ts-expect-error - Prism components don't have type definitions
      await import('prismjs/components/prism-json');
      // @ts-expect-error - Prism components don't have type definitions
      await import('prismjs/components/prism-yaml');
      // @ts-expect-error - Prism components don't have type definitions
      await import('prismjs/components/prism-bash');
      // @ts-expect-error - Prism components don't have type definitions
      await import('prismjs/components/prism-markdown');
      setPrism(prism);
    };
    loadPrism();
  }, []);

  const lines = snippet.code.split('\n');

  const getAnnotationForLine = (lineNumber: number): Annotation | undefined => {
    return snippet.annotations.find((a) => a.line === lineNumber);
  };

  const getAnnotationTypeStyles = (type: Annotation['type']): string => {
    switch (type) {
      case 'key-point':
        return 'bg-yellow-500/20 border-yellow-500';
      case 'explanation':
        return 'bg-blue-500/20 border-blue-500';
      case 'connection':
        return 'bg-purple-500/20 border-purple-500';
      case 'warning':
        return 'bg-red-500/20 border-red-500';
      default:
        return 'bg-muted border-border';
    }
  };

  const highlightCode = (code: string, language: string): string => {
    if (!Prism) return code;

    const prismLanguage = Prism.languages[language] || Prism.languages.javascript;
    try {
      return Prism.highlight(code, prismLanguage, language);
    } catch {
      return code;
    }
  };

  return (
    <div className="relative font-mono text-sm">
      <div className="flex items-center gap-2 px-4 py-2 bg-muted border-b border-border text-xs text-muted-foreground">
        <span className="font-medium">{snippet.file}</span>
        <span className="opacity-60">
          Lines {snippet.startLine}-{snippet.endLine}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <tbody>
            {lines.map((line, index) => {
              const lineNumber = snippet.startLine + index;
              const annotation = getAnnotationForLine(lineNumber);
              const hasAnnotation = !!annotation;
              const isHovered = hoveredLine === lineNumber;

              return (
                <tr
                  key={lineNumber}
                  className={cn(
                    'group hover:bg-muted/50 transition-colors',
                    hasAnnotation && 'bg-muted/30'
                  )}
                  onMouseEnter={() => setHoveredLine(lineNumber)}
                  onMouseLeave={() => setHoveredLine(null)}
                >
                  <td className="w-14 px-3 py-0.5 text-right text-muted-foreground/70 select-none border-r border-border bg-muted/30 sticky left-0">
                    <span className="tabular-nums">{lineNumber}</span>
                    {hasAnnotation && (
                      <span className="ml-1 text-yellow-500">*</span>
                    )}
                  </td>
                  <td className="px-4 py-0.5 relative">
                    <pre className="whitespace-pre">
                      <code
                        dangerouslySetInnerHTML={{
                          __html: highlightCode(line || ' ', snippet.language),
                        }}
                      />
                    </pre>

                    {/* Annotation tooltip */}
                    {hasAnnotation && isHovered && (
                      <div
                        className={cn(
                          'absolute left-4 top-full z-50 mt-1 p-3 rounded-lg shadow-lg border max-w-md',
                          getAnnotationTypeStyles(annotation.type)
                        )}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-medium uppercase opacity-70">
                            {annotation.type.replace('-', ' ')}
                          </span>
                        </div>
                        <p className="text-sm">{annotation.text}</p>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Legend for annotation types */}
      {snippet.annotations.length > 0 && (
        <div className="flex flex-wrap gap-3 px-4 py-2 border-t border-border text-xs">
          <span className="text-muted-foreground">Hover over * for annotations:</span>
          {['key-point', 'explanation', 'connection', 'warning'].map((type) => {
            const hasType = snippet.annotations.some((a) => a.type === type);
            if (!hasType) return null;
            return (
              <span
                key={type}
                className={cn(
                  'px-2 py-0.5 rounded border',
                  getAnnotationTypeStyles(type as Annotation['type'])
                )}
              >
                {type.replace('-', ' ')}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
