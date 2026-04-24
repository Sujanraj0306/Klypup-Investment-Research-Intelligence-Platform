import { useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { ReportSections } from '../types';
import type {
  AgentStep,
  CompleteEvent,
  ResearchState,
} from '../types/research';

const INITIAL: ResearchState = {
  status: 'idle',
  sections: {},
  agentSteps: [],
  progress: 0,
  companies: [],
  toolsUsed: [],
  reportId: null,
  durationMs: null,
  error: null,
};

interface AgentStepEvent {
  step: string;
  tool?: string;
  progress?: number;
  duration_ms?: number;
}

interface SectionEvent {
  section: string;
  data: unknown;
}

export function useResearch() {
  const [state, setState] = useState<ResearchState>(INITIAL);
  const abortRef = useRef<AbortController | null>(null);
  const qc = useQueryClient();

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setState(INITIAL);
  }, []);

  const startResearch = useCallback(
    async (query: string, companies?: string[], timePeriod?: string) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setState({
        ...INITIAL,
        status: 'streaming',
        progress: 1,
      });

      let sawCompleteEvent = false;
      let frameCount = 0;

      try {
        await api.stream(
          '/api/research/stream',
          { query, companies, time_period: timePeriod },
          ({ event, data }) => {
            frameCount += 1;
            // eslint-disable-next-line no-console
            console.debug('[research SSE]', event, data);
            if (event === 'agent_step') {
              const d = data as AgentStepEvent;
              setState((prev) => {
                const now = Date.now();
                const prevSteps = prev.agentSteps;
                const updated: AgentStep[] = prevSteps.map((s, idx) =>
                  idx === prevSteps.length - 1 && s.completedAt === undefined
                    ? { ...s, completedAt: now, durationMs: now - s.startedAt }
                    : s,
                );
                updated.push({
                  step: d.step,
                  tool: d.tool,
                  progress: d.progress ?? prev.progress,
                  startedAt: now,
                  durationMs: d.duration_ms,
                });
                return {
                  ...prev,
                  agentSteps: updated,
                  progress: d.progress ?? prev.progress,
                };
              });
            } else if (event === 'section') {
              const d = data as SectionEvent;
              setState((prev) => ({
                ...prev,
                sections: {
                  ...prev.sections,
                  [d.section]: d.data,
                } as ReportSections,
              }));
            } else if (event === 'complete') {
              sawCompleteEvent = true;
              const d = data as CompleteEvent;
              setState((prev) => {
                const now = Date.now();
                const steps = prev.agentSteps.map((s, idx) =>
                  idx === prev.agentSteps.length - 1 && s.completedAt === undefined
                    ? { ...s, completedAt: now, durationMs: now - s.startedAt }
                    : s,
                );
                return {
                  ...prev,
                  status: 'complete',
                  progress: 100,
                  companies: d.companies || [],
                  toolsUsed: d.tools_used || [],
                  reportId: d.report_id,
                  durationMs: d.duration_ms,
                  agentSteps: steps,
                };
              });
              qc.invalidateQueries({ queryKey: ['reports'] });
            } else if (event === 'error') {
              const d = data as { message?: string };
              setState((prev) => ({
                ...prev,
                status: 'error',
                error: d.message || 'Research failed',
              }));
            }
          },
          controller.signal,
        );
        // Safety net: if the stream closed without a `complete` event (stale
        // bundle, proxy buffered out the last frame, etc.), don't leave the
        // UI hanging. Refetch reports and assume the most recent one is ours.
        if (!sawCompleteEvent) {
          // eslint-disable-next-line no-console
          console.warn(
            `[research] stream ended without complete event (got ${frameCount} frames). Recovering…`,
          );
          try {
            const latest = await api.get<{
              items: Array<{ id: string; companies?: string[]; createdAt: string | null }>;
            }>('/api/reports?limit=1');
            const top = latest.items?.[0];
            setState((prev) => ({
              ...prev,
              status: 'complete',
              progress: 100,
              reportId: top?.id ?? prev.reportId,
              companies: top?.companies ?? prev.companies,
              error:
                frameCount === 0
                  ? 'The server finished but no progress events reached the browser. Opening the saved report.'
                  : null,
            }));
            qc.invalidateQueries({ queryKey: ['reports'] });
          } catch {
            setState((prev) => ({
              ...prev,
              status: 'complete',
              progress: 100,
            }));
          }
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        setState((prev) => ({
          ...prev,
          status: 'error',
          error: err instanceof Error ? err.message : 'Research failed',
        }));
      }
    },
    [qc],
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setState((prev) => ({ ...prev, status: 'idle' }));
  }, []);

  return { state, startResearch, cancel, reset };
}
