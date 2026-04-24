import { useCallback, useRef, useState } from 'react';
import { api } from '../lib/api';
import type {
  CompareMarketSection,
  CompareNewsSection,
  CompareSocialSection,
  CompareState,
  CompareSynthesisSection,
} from '../types/compare';

const INITIAL: CompareState = {
  status: 'idle',
  symbols: [],
  progress: 0,
  steps: [],
  market: null,
  news: null,
  social: null,
  synthesis: null,
  durationMs: null,
  error: null,
};

interface AgentStepPayload {
  step: string;
  progress?: number;
}

interface SectionPayload {
  section: 'market' | 'news' | 'social' | 'synthesis';
  data: unknown;
}

interface CompletePayload {
  symbols: string[];
  duration_ms: number;
  progress: number;
}

export function useCompare() {
  const [state, setState] = useState<CompareState>(INITIAL);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setState(INITIAL);
  }, []);

  const startCompare = useCallback(async (symbols: string[]) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setState({ ...INITIAL, status: 'streaming', symbols, progress: 1 });

    try {
      await api.stream(
        '/api/compare/stream',
        { symbols },
        ({ event, data }) => {
          if (event === 'agent_step') {
            const d = data as AgentStepPayload;
            setState((prev) => ({
              ...prev,
              progress: d.progress ?? prev.progress,
              steps: [...prev.steps, { step: d.step, progress: d.progress ?? prev.progress }],
            }));
          } else if (event === 'section') {
            const d = data as SectionPayload;
            setState((prev) => {
              if (d.section === 'market') {
                return { ...prev, market: d.data as CompareMarketSection };
              }
              if (d.section === 'news') {
                return { ...prev, news: d.data as CompareNewsSection };
              }
              if (d.section === 'social') {
                return { ...prev, social: d.data as CompareSocialSection };
              }
              if (d.section === 'synthesis') {
                return { ...prev, synthesis: d.data as CompareSynthesisSection };
              }
              return prev;
            });
          } else if (event === 'complete') {
            const d = data as CompletePayload;
            setState((prev) => ({
              ...prev,
              status: 'complete',
              progress: 100,
              durationMs: d.duration_ms,
            }));
          } else if (event === 'error') {
            const d = data as { message?: string };
            setState((prev) => ({
              ...prev,
              status: 'error',
              error: d.message || 'Comparison failed',
            }));
          }
        },
        controller.signal,
      );
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      setState((prev) => ({
        ...prev,
        status: 'error',
        error: err instanceof Error ? err.message : 'Comparison failed',
      }));
    }
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setState((prev) => ({ ...prev, status: 'idle' }));
  }, []);

  return { state, startCompare, cancel, reset };
}
