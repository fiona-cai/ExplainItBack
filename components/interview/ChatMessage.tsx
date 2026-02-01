'use client';

import { cn } from '@/lib/utils';
import type { ChatMessage as ChatMessageType } from '@/types/interview';

interface ChatMessageProps {
  message: ChatMessageType;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  return (
    <div
      className={cn(
        'flex w-full mb-2',
        isUser ? 'justify-end' : 'justify-start'
      )}
    >
      <div
        className={cn(
          'max-w-[85%] rounded-lg px-2.5 py-2',
          isUser
            ? 'bg-primary text-primary-foreground'
            : isSystem
            ? 'bg-muted text-muted-foreground border border-border'
            : 'bg-secondary text-secondary-foreground'
        )}
      >
        {message.metadata?.type === 'question' && (
          <div className="text-xs font-medium mb-1 opacity-70">
            Question
          </div>
        )}
        {message.metadata?.type === 'evaluation' && (
          <div className="text-xs font-medium mb-1 opacity-70">
            Evaluation
          </div>
        )}
        {message.metadata?.type === 'hint' && (
          <div className="text-xs font-medium mb-1 opacity-70">
            Hint
          </div>
        )}

        <div className="whitespace-pre-wrap text-xs leading-relaxed">
          {formatMessageContent(message.content)}
        </div>

        {message.metadata?.score !== undefined && (
          <div className="mt-1.5 pt-1.5 border-t border-current/20">
            <span className="text-xs font-medium">
              Score: {message.metadata.score}/100
            </span>
          </div>
        )}

        <div className="mt-1 text-xs opacity-50">
          {new Date(message.timestamp).toLocaleTimeString()}
        </div>
      </div>
    </div>
  );
}

function formatMessageContent(content: string): React.ReactNode {
  // Simple markdown-like formatting
  const parts = content.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);

  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={index} className="font-semibold">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('*') && part.endsWith('*')) {
      return (
        <em key={index} className="italic">
          {part.slice(1, -1)}
        </em>
      );
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code
          key={index}
          className="px-1 py-0.5 rounded bg-black/10 dark:bg-white/10 font-mono text-xs"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}
