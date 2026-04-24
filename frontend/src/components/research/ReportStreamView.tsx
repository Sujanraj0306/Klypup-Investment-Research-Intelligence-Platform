import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CheckCircle2, Archive } from 'lucide-react';
import { Button } from '../ui/Button';
import { MarketSection } from '../report/MarketSection';
import { NewsSection } from '../report/NewsSection';
import { FilingsSection } from '../report/FilingsSection';
import { SocialSection } from '../report/SocialSection';
import { SynthesisSection } from '../report/SynthesisSection';
import { RisksSection } from '../report/RisksSection';
import type { ResearchState } from '../../types/research';
import type {
  FilingsSectionData,
  MarketSectionData,
  NewsSectionData,
  RisksSectionData,
  SocialSectionData,
  SynthesisSectionData,
} from '../../types/research';

interface ReportStreamViewProps {
  state: ResearchState;
  query: string;
}

const SECTION_KEYS = [
  'market',
  'news',
  'filings',
  'social',
  'synthesis',
  'risks',
] as const;

function getSection<T>(
  sections: Record<string, unknown>,
  key: string,
): T | undefined {
  return sections[key] as T | undefined;
}

export function ReportStreamView({ state, query }: ReportStreamViewProps) {
  const navigate = useNavigate();
  const sections = state.sections as Record<string, unknown>;
  const anySection = SECTION_KEYS.some((k) => sections[k] !== undefined);

  return (
    <div className="flex flex-col gap-4">
      {state.status === 'complete' && state.reportId && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gain/40 bg-gain-subtle/60 p-3 text-sm"
        >
          <div className="flex items-center gap-2 text-gain">
            <CheckCircle2 size={16} />
            <span>
              Research complete — report saved to your archive
              {state.durationMs
                ? ` · ${(state.durationMs / 1000).toFixed(1)}s`
                : ''}
              .
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<Archive size={14} />}
              onClick={() => navigate(`/reports/${state.reportId}`)}
            >
              Open report
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => navigate(`/reports/${state.reportId}`)}
            >
              Add Tags →
            </Button>
          </div>
        </motion.div>
      )}

      {state.error && (
        <div className="rounded-lg border border-loss/40 bg-loss-subtle p-3 text-sm text-loss">
          {state.error}
        </div>
      )}

      {!anySection && state.status === 'streaming' && (
        <div className="rounded-lg border border-border-subtle bg-bg-secondary p-8 text-center text-sm text-slate-500">
          Gathering data… sections will appear as the agent finishes each tool.
        </div>
      )}

      {SECTION_KEYS.map((key) => {
        const raw = sections[key];
        if (raw === undefined) return null;
        return (
          <motion.div
            key={key}
            layout
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            {key === 'market' && (
              <MarketSection data={getSection<MarketSectionData>(sections, key) || {}} />
            )}
            {key === 'news' && (
              <NewsSection data={getSection<NewsSectionData>(sections, key) || {}} />
            )}
            {key === 'filings' && (
              <FilingsSection
                data={getSection<FilingsSectionData>(sections, key) || {}}
                query={query}
              />
            )}
            {key === 'social' && (
              <SocialSection data={getSection<SocialSectionData>(sections, key) || {}} />
            )}
            {key === 'synthesis' && (
              <SynthesisSection
                data={getSection<SynthesisSectionData>(sections, key) || {}}
                companies={state.companies}
              />
            )}
            {key === 'risks' && (
              <RisksSection
                data={getSection<RisksSectionData>(sections, key) || []}
              />
            )}
          </motion.div>
        );
      })}
    </div>
  );
}
