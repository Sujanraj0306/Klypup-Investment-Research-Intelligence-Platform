import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, Send, User, Volume2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { api, ApiError } from '../../lib/api';
import { cn } from '../../lib/cn';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

interface ChatFollowupProps {
  reportData: Record<string, unknown>;
  reportTitle?: string;
}

const SUGGESTED: string[] = [
  'Which is the better buy right now?',
  "What's the ideal entry price?",
  'Explain the biggest risk in detail',
  'How does valuation compare to peers?',
];

function greetingFor(reportData: Record<string, unknown>): string {
  const companies = (reportData?.companies as string[] | undefined) ?? [];
  const label = companies.length ? companies.join(', ') : 'this query';
  return `I've completed the research on **${label}**. Ask me anything — valuation, timing, risks, or how this fits a portfolio.`;
}

export function ChatFollowup({ reportData, reportTitle }: ChatFollowupProps) {
  void reportTitle;
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      role: 'assistant',
      content: greetingFor(reportData),
      timestamp: Date.now(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, streamingText]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const send = async (raw: string) => {
    const text = raw.trim();
    if (!text || isLoading) return;

    const userMsg: ChatMessage = { role: 'user', content: text, timestamp: Date.now() };
    const history = [...messages, userMsg];
    setMessages(history);
    setInput('');
    setIsLoading(true);
    setStreamingText('');
    setError(null);

    const controller = new AbortController();
    abortRef.current = controller;

    let accumulated = '';
    try {
      await api.stream(
        '/api/chat/followup',
        {
          message: text,
          report_context: reportData,
          history: messages.map((m) => ({ role: m.role, content: m.content })),
        },
        ({ event, data }) => {
          if (event === 'chunk') {
            const d = data as { text?: string };
            if (d.text) {
              accumulated += d.text;
              setStreamingText(accumulated);
            }
          } else if (event === 'done') {
            setMessages((prev) => [
              ...prev,
              { role: 'assistant', content: accumulated, timestamp: Date.now() },
            ]);
            setStreamingText('');
          } else if (event === 'error') {
            const d = data as { message?: string };
            setError(d.message || 'Chat failed');
            setStreamingText('');
          }
        },
        controller.signal,
      );
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        const msg = e instanceof ApiError ? e.message : 'Chat request failed';
        setError(msg);
      }
    } finally {
      setIsLoading(false);
      abortRef.current = null;
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  const readAloud = (text: string) => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const cleaned = text.replace(/\*\*|\*|`/g, '');
    const utter = new SpeechSynthesisUtterance(cleaned);
    utter.rate = 0.95;
    window.speechSynthesis.speak(utter);
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-2 border-b border-border-subtle px-4 py-3">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-brand-blue">
          <Bot size={14} className="text-white" />
        </span>
        <div>
          <p className="text-sm font-semibold text-slate-100">Research Assistant</p>
          <p className="text-[11px] text-slate-500">Ask follow-up questions</p>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-gain" />
          <span className="text-[11px] text-slate-500">Live</span>
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        <AnimatePresence initial={false}>
          {messages.map((m, i) => (
            <motion.div
              key={`${m.timestamp}-${i}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className={cn('group flex gap-2.5', m.role === 'user' && 'flex-row-reverse')}
            >
              <span
                className={cn(
                  'flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full',
                  m.role === 'user'
                    ? 'bg-brand-blue text-white'
                    : 'bg-gradient-to-br from-purple-500 to-brand-blue text-white',
                )}
              >
                {m.role === 'user' ? <User size={13} /> : <Bot size={13} />}
              </span>
              <div
                className={cn(
                  'max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed',
                  m.role === 'user'
                    ? 'rounded-tr-sm bg-brand-blue text-white'
                    : 'rounded-tl-sm border border-border-subtle bg-bg-tertiary text-slate-200',
                )}
              >
                {m.role === 'assistant' ? (
                  <div className="prose prose-invert prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-strong:text-white">
                    <ReactMarkdown>{m.content}</ReactMarkdown>
                  </div>
                ) : (
                  <p>{m.content}</p>
                )}
                {m.role === 'assistant' && i > 0 && (
                  <button
                    onClick={() => readAloud(m.content)}
                    className="mt-1.5 flex items-center gap-1 text-[11px] text-slate-500 opacity-0 transition-opacity hover:text-slate-200 group-hover:opacity-100"
                  >
                    <Volume2 size={11} /> Read aloud
                  </button>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {streamingText && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex gap-2.5"
          >
            <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-brand-blue">
              <Bot size={13} className="text-white" />
            </span>
            <div className="max-w-[85%] rounded-2xl rounded-tl-sm border border-border-subtle bg-bg-tertiary px-3.5 py-2.5 text-sm leading-relaxed text-slate-200">
              <div className="prose prose-invert prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-strong:text-white">
                <ReactMarkdown>{streamingText}</ReactMarkdown>
              </div>
              <div className="mt-1.5 flex gap-1">
                <span className="h-1 w-1 animate-bounce rounded-full bg-brand-blue [animation-delay:0ms]" />
                <span className="h-1 w-1 animate-bounce rounded-full bg-brand-blue [animation-delay:150ms]" />
                <span className="h-1 w-1 animate-bounce rounded-full bg-brand-blue [animation-delay:300ms]" />
              </div>
            </div>
          </motion.div>
        )}

        {isLoading && !streamingText && (
          <div className="flex gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-brand-blue">
              <Bot size={13} className="text-white" />
            </span>
            <div className="rounded-2xl rounded-tl-sm border border-border-subtle bg-bg-tertiary px-4 py-3">
              <div className="flex gap-1">
                <span className="h-2 w-2 animate-bounce rounded-full bg-slate-500 [animation-delay:0ms]" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-slate-500 [animation-delay:150ms]" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-slate-500 [animation-delay:300ms]" />
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-md border border-loss/40 bg-loss-subtle p-2 text-[12px] text-loss">
            {error}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {messages.length <= 1 && (
        <div className="flex flex-wrap gap-2 px-4 pb-2">
          {SUGGESTED.map((q) => (
            <button
              key={q}
              onClick={() => send(q)}
              className="rounded-full border border-border-subtle bg-bg-tertiary px-3 py-1 text-[11px] text-slate-400 transition-colors hover:border-brand-blue hover:text-slate-100"
            >
              {q}
            </button>
          ))}
        </div>
      )}

      <div className="border-t border-border-subtle p-3">
        <div className="flex items-end gap-2 rounded-xl border border-border-default bg-bg-tertiary p-2 focus-within:border-brand-blue">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Ask a follow-up question…"
            rows={1}
            disabled={isLoading}
            className="max-h-24 flex-1 resize-none overflow-y-auto bg-transparent px-1 py-1 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none"
          />
          <button
            onClick={() => send(input)}
            disabled={!input.trim() || isLoading}
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-brand-blue text-white transition-colors hover:bg-brand-glow disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Send"
          >
            <Send size={14} />
          </button>
        </div>
        <p className="mt-1.5 text-center text-[10px] text-slate-600">
          Enter to send · Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}
