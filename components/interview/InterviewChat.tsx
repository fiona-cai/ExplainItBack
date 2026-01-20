'use client';

import { useRef, useEffect } from 'react';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { Loader2 } from 'lucide-react';
import type { ChatMessage as ChatMessageType } from '@/types/interview';

interface InterviewChatProps {
  messages: ChatMessageType[];
  onSendMessage: (message: string) => void;
  onRequestHint?: () => void;
  isLoading?: boolean;
  showHintButton?: boolean;
  inputPlaceholder?: string;
  disabled?: boolean;
}

export function InterviewChat({
  messages,
  onSendMessage,
  onRequestHint,
  isLoading = false,
  showHintButton = false,
  inputPlaceholder = 'Type your answer...',
  disabled = false,
}: InterviewChatProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4">
        {messages.map((message) => (
          <ChatMessage key={message.id} message={message} />
        ))}

        {isLoading && (
          <div className="flex items-center gap-2 text-muted-foreground p-4">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Thinking...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <ChatInput
        onSend={onSendMessage}
        onRequestHint={onRequestHint}
        disabled={disabled || isLoading}
        placeholder={inputPlaceholder}
        showHintButton={showHintButton}
      />
    </div>
  );
}
