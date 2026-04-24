import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { Mic, Send, Search } from 'lucide-react';
import { useToast } from '../ui/Toast';
import { Spinner } from '../ui/Spinner';
import { cn } from '../../lib/cn';
import {
  getSpeechRecognitionCtor,
  hasSpeechRecognition,
} from '../../lib/speechUtils';

interface QueryInputProps {
  onSubmit: (query: string) => void;
  isLoading: boolean;
  placeholder?: string;
  initialValue?: string;
  autoFocus?: boolean;
  size?: 'md' | 'lg';
}

export interface QueryInputHandle {
  focus: () => void;
  setValue: (v: string) => void;
  startVoice: () => void;
}

export const QueryInput = forwardRef<QueryInputHandle, QueryInputProps>(
  function QueryInput(
    {
      onSubmit,
      isLoading,
      placeholder = 'Ask anything about companies, markets, or filings…',
      initialValue = '',
      autoFocus = false,
      size = 'lg',
    },
    ref,
  ) {
    const [query, setQuery] = useState(initialValue);
    const [isListening, setIsListening] = useState(false);
    const [validationError, setValidationError] = useState<string | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    const recognitionRef = useRef<SpeechRecognition | null>(null);
    const toast = useToast();

    useImperativeHandle(ref, () => ({
      focus: () => textareaRef.current?.focus(),
      setValue: (v: string) => setQuery(v),
      startVoice: () => startVoice(),
    }));

    useEffect(() => {
      if (autoFocus) textareaRef.current?.focus();
    }, [autoFocus]);

    // Auto-grow textarea (1→~4 lines)
    useEffect(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.style.height = 'auto';
      const next = Math.min(el.scrollHeight, 160);
      el.style.height = `${next}px`;
    }, [query]);

    const submit = useCallback(() => {
      const trimmed = query.trim();
      if (!trimmed || isLoading) return;

      if (trimmed.length < 10) {
        setValidationError(
          "Query is too short. Try a full question, e.g. 'Analyze Apple Q3 earnings'.",
        );
        return;
      }

      const financialKeywords = [
        'stock', 'analyze', 'analysis', 'earnings', 'revenue', 'company', 'compare',
        'price', 'market', 'invest', 'shares', 'quarterly', 'annual', 'financial',
        'risk', 'growth', 'profit', 'sector', 'portfolio', 'fund', 'etf', 'index',
        'bull', 'bear', 'valuation', 'dividend', 'balance', 'sheet', 'forecast',
        'sentiment', 'news', 'filing', 'report', 'outlook', 'guidance', 'briefing',
      ];
      const tickerPattern = /\b[A-Z]{1,5}\b/;
      const lower = trimmed.toLowerCase();
      const hasKeyword = financialKeywords.some((kw) => lower.includes(kw));
      const hasTicker = tickerPattern.test(trimmed);

      if (!hasKeyword && !hasTicker) {
        setValidationError(
          "Please enter a financial research query. Try: 'Analyze NVIDIA Q3 earnings', 'Compare Apple and Microsoft', or 'Biggest risks for Tesla'.",
        );
        return;
      }

      setValidationError(null);
      onSubmit(trimmed);
    }, [query, isLoading, onSubmit]);

    const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        submit();
      }
    };

    const stopVoice = useCallback(() => {
      recognitionRef.current?.stop();
      recognitionRef.current = null;
      setIsListening(false);
    }, []);

    const startVoice = useCallback(() => {
      if (isListening) {
        stopVoice();
        return;
      }
      if (!hasSpeechRecognition()) {
        toast.error('Voice input requires Chrome or Edge.');
        return;
      }
      const Ctor = getSpeechRecognitionCtor();
      if (!Ctor) return;
      const recognition = new Ctor();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      let transcript = '';
      recognition.onresult = (event: SpeechRecognitionEvent) => {
        transcript = Array.from(event.results)
          .map((r) => r[0].transcript)
          .join('');
        setQuery(transcript);
      };
      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        toast.error(`Voice error: ${event.error}`);
        stopVoice();
      };
      recognition.onend = () => {
        setIsListening(false);
        recognitionRef.current = null;
        if (transcript.trim()) onSubmit(transcript.trim());
      };

      recognitionRef.current = recognition;
      setIsListening(true);
      try {
        recognition.start();
      } catch {
        setIsListening(false);
      }
    }, [isListening, onSubmit, stopVoice, toast]);

    useEffect(() => () => recognitionRef.current?.stop(), []);

    return (
      <div className="flex flex-col gap-2">
        <div
          className={cn(
            'relative flex items-start gap-2 rounded-2xl border bg-bg-secondary transition-colors',
            isLoading
              ? 'border-transparent bg-clip-padding klypup-gradient-border'
              : 'border-border-default hover:border-border-strong focus-within:border-brand-blue',
            size === 'lg' ? 'px-4 py-3' : 'px-3 py-2',
          )}
        >
          <div className="flex h-10 items-center pt-1 text-slate-500">
            {isLoading ? <Spinner size="sm" /> : <Search size={18} />}
          </div>
          <textarea
            ref={textareaRef}
            rows={1}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (validationError) setValidationError(null);
            }}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            disabled={isLoading}
            className={cn(
              'flex-1 resize-none bg-transparent text-slate-100 placeholder:text-slate-500 focus:outline-none',
              size === 'lg' ? 'text-base' : 'text-sm',
            )}
            style={{ minHeight: 28 }}
          />
          <div className="flex items-center gap-1 pt-0.5">
            <button
              type="button"
              onClick={startVoice}
              disabled={isLoading}
              title={isListening ? 'Stop listening' : 'Voice input'}
              className={cn(
                'relative flex h-9 w-9 items-center justify-center rounded-full transition-colors',
                isListening
                  ? 'bg-loss text-white'
                  : 'text-slate-400 hover:bg-bg-tertiary hover:text-brand-glow',
              )}
            >
              <Mic size={16} />
              {isListening && (
                <>
                  <span className="absolute inset-0 animate-ping rounded-full bg-loss/60" />
                  <span className="absolute -inset-1 animate-pulse rounded-full border border-loss/50" />
                </>
              )}
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={!query.trim() || isLoading}
              aria-label="Send"
              className={cn(
                'flex h-9 w-9 items-center justify-center rounded-full transition-colors',
                query.trim() && !isLoading
                  ? 'bg-brand-blue text-white hover:bg-brand-glow'
                  : 'bg-bg-tertiary text-slate-500',
              )}
            >
              {isLoading ? <Spinner size="sm" /> : <Send size={16} />}
            </button>
          </div>
        </div>
        {validationError && !isLoading && (
          <p className="rounded-md border border-loss/40 bg-loss-subtle px-3 py-1.5 text-[12px] text-loss">
            {validationError}
          </p>
        )}
        {isLoading && (
          <p className="text-center text-[11px] text-slate-500">
            Processing with Gemini 2.5 Flash + 5 data tools…
          </p>
        )}
      </div>
    );
  },
);
