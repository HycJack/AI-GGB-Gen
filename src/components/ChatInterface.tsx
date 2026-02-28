import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { Send, Loader2, User, Bot, Play, Copy, Check, Sparkles } from 'lucide-react';
import { ChatMessage } from '../lib/gemini';
import { cn } from '../lib/utils';

interface ChatInterfaceProps {
  messages: ChatMessage[];
  onSendMessage: (message: string) => void;
  onExecuteCommands?: (commands: string[]) => void;
  onUpdateMessage?: (index: number, content: string) => void;
  isLoading: boolean;
  className?: string;
}

export default function ChatInterface({ messages, onSendMessage, onExecuteCommands, onUpdateMessage, isLoading, className }: ChatInterfaceProps) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [input]);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (input.trim() && !isLoading) {
      onSendMessage(input.trim());
      setInput('');
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

  const CodeBlock = ({ inline, className, children, messageIndex, fullMessageContent, ...props }: any) => {
    const match = /language-(\w+)/.exec(className || '');
    const isGeoGebra = match && match[1] === 'geogebra';
    // ReactMarkdown passes children as string (usually), but sometimes array. Safe cast.
    const originalContent = String(children).replace(/\n$/, '');
    const [code, setCode] = useState(originalContent);
    const [copied, setCopied] = useState(false);

    // Update local state if the prop changes (e.g. after save)
    useEffect(() => {
      setCode(originalContent);
    }, [originalContent]);

    const handleCopy = () => {
      navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    };

    const handleExecute = () => {
      if (onExecuteCommands) {
        onExecuteCommands(code.split('\n'));
      }
      
      // Save changes if content is modified
      if (onUpdateMessage && fullMessageContent && code !== originalContent) {
        // Simple string replacement. 
        // Note: This assumes the code block content is unique in the message or we replace the first occurrence.
        // Since we don't have exact positioning, this is a reasonable approximation for this use case.
        const newContent = fullMessageContent.replace(originalContent, code);
        onUpdateMessage(messageIndex, newContent);
      }
    };

    if (!inline && isGeoGebra) {
      return (
        <div className="my-4 bg-gray-50 rounded-md border border-gray-200 overflow-hidden font-sans">
          <div className="flex justify-between items-center px-3 py-2 bg-gray-100/50 border-b border-gray-200">
            <span className="text-xs font-medium text-gray-500">GeoGebra</span>
            <div className="flex items-center gap-2">
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors px-2 py-1 rounded hover:bg-gray-200"
                title="复制指令"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? '已复制' : '复制'}
              </button>
              {onExecuteCommands && (
                <button
                  onClick={handleExecute}
                  className="flex items-center gap-1.5 text-xs bg-green-50 text-green-700 px-2 py-1 rounded border border-green-200 hover:bg-green-100 transition-colors"
                >
                  <Play className="w-3.5 h-3.5" />
                  执行
                </button>
              )}
            </div>
          </div>
          <div className="relative">
            <textarea
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="w-full p-4 font-mono text-sm bg-white border-none focus:ring-0 resize-y min-h-[100px] outline-none text-gray-800 leading-relaxed"
              spellCheck={false}
            />
          </div>
        </div>
      );
    }

    return !inline && match ? (
      <code className={className} {...props}>
        {children}
      </code>
    ) : (
      <code className="bg-gray-100 text-red-500 rounded px-1.5 py-0.5 text-sm font-mono" {...props}>
        {children}
      </code>
    );
  };

  return (
    <div className={cn("flex flex-col h-full bg-white relative", className)}>
      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-gray-400 p-8">
            <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center mb-4">
              <Sparkles className="w-8 h-8 text-gray-300" />
            </div>
            <p className="font-medium text-gray-500">GeoGebra AI Tutor</p>
            <p className="text-sm mt-2">我可以帮你分析几何题目并生成图形</p>
          </div>
        ) : (
          <div className="flex flex-col pb-32">
            {messages.map((msg, index) => (
              <div
                key={index}
                className={cn(
                  "w-full px-4 py-6 border-b border-black/5",
                  msg.role === 'assistant' ? "bg-gray-50/50" : "bg-white"
                )}
              >
                <div className="max-w-3xl mx-auto flex gap-4 md:gap-6">
                  {/* Avatar */}
                  <div className="flex-shrink-0 flex flex-col relative items-end">
                    <div className={cn(
                      "w-8 h-8 rounded-sm flex items-center justify-center",
                      msg.role === 'assistant' ? "bg-green-500" : "bg-purple-600"
                    )}>
                      {msg.role === 'assistant' ? (
                        <Sparkles className="w-5 h-5 text-white" />
                      ) : (
                        <User className="w-5 h-5 text-white" />
                      )}
                    </div>
                  </div>

                  {/* Content */}
                  <div className="relative flex-1 overflow-hidden">
                    <div className="font-semibold text-sm mb-1 opacity-90">
                      {msg.role === 'assistant' ? 'AI Tutor' : 'You'}
                    </div>
                    <div className="prose prose-slate max-w-none prose-p:leading-relaxed prose-pre:p-0 prose-pre:bg-transparent">
                      <ReactMarkdown 
                        remarkPlugins={[remarkGfm, remarkMath]}
                        rehypePlugins={[rehypeKatex]}
                        components={{
                          code: (props) => (
                            <CodeBlock 
                              {...props} 
                              messageIndex={index} 
                              fullMessageContent={msg.content} 
                            />
                          ),
                          p: ({children}) => <p className="mb-4 last:mb-0">{children}</p>,
                          a: ({children, href}) => <a href={href} className="text-blue-600 hover:underline" target="_blank" rel="noopener noreferrer">{children}</a>,
                          ul: ({children}) => <ul className="list-disc pl-4 mb-4">{children}</ul>,
                          ol: ({children}) => <ol className="list-decimal pl-4 mb-4">{children}</ol>,
                        }}
                      >
                        {msg.content}
                      </ReactMarkdown>
                    </div>
                  </div>
                </div>
              </div>
            ))}
            
            {isLoading && (
              <div className="w-full px-4 py-6 bg-gray-50/50 border-b border-black/5">
                <div className="max-w-3xl mx-auto flex gap-4 md:gap-6">
                  <div className="w-8 h-8 rounded-sm bg-green-500 flex items-center justify-center flex-shrink-0">
                    <Sparkles className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex items-center">
                    <div className="flex space-x-1">
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                    </div>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="absolute bottom-0 left-0 w-full bg-gradient-to-t from-white via-white to-transparent pt-10 pb-6 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="relative flex items-end w-full p-3 bg-white border border-gray-200 shadow-lg rounded-xl focus-within:ring-1 focus-within:ring-black/10 focus-within:border-black/10 overflow-hidden ring-offset-2 ring-offset-white">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="发送消息..."
              className="w-full max-h-[200px] py-2 pr-10 bg-transparent border-none focus:ring-0 resize-none outline-none text-gray-800 placeholder:text-gray-400"
              rows={1}
              disabled={isLoading}
            />
            <button
              onClick={() => handleSubmit()}
              disabled={isLoading || !input.trim()}
              className={cn(
                "absolute right-3 bottom-3 p-1.5 rounded-md transition-all duration-200",
                input.trim() 
                  ? "bg-green-500 text-white hover:bg-green-600 shadow-sm" 
                  : "bg-transparent text-gray-300 cursor-not-allowed"
              )}
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
          <div className="text-center mt-2">
            <p className="text-xs text-gray-400">
              AI 可能会生成不准确的信息，请核对重要事实。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
