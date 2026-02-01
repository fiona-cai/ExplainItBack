'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Send, Lightbulb } from 'lucide-react';

interface ChatInputProps {
  onSend: (message: string) => void;
  onRequestHint?: () => void;
  disabled?: boolean;
  placeholder?: string;
  showHintButton?: boolean;
}

export function ChatInput({
  onSend,
  onRequestHint,
  disabled = false,
  placeholder = 'Type your answer...',
  showHintButton = false,
}: ChatInputProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [value]);

  const handleSubmit = () => {
    if (value.trim() && !disabled) {
      onSend(value.trim());
      setValue('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="flex gap-2 items-end p-2 border-t border-border bg-background shrink-0">
      {showHintButton && onRequestHint && (
        <Button
          variant="outline"
          size="icon"
          onClick={onRequestHint}
          disabled={disabled}
          title="Request a hint"
          className="shrink-0"
        >
          <Lightbulb className="h-4 w-4" />
        </Button>
      )}
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        className="min-h-[36px] max-h-[120px] resize-none text-sm"
        rows={1}
      />
      <Button
        onClick={handleSubmit}
        disabled={disabled || !value.trim()}
        size="icon"
        className="shrink-0"
      >
        <Send className="h-4 w-4" />
      </Button>
    </div>
  );
}
