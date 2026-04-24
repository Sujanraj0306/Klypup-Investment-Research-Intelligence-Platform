import { useMemo, useState, type KeyboardEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Download,
  Tag as TagIcon,
  Trash2,
  X,
} from 'lucide-react';
import { AppShell } from '../layout/AppShell';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Spinner } from '../ui/Spinner';
import { Input } from '../ui/Input';
import { useToast } from '../ui/Toast';
import { MarketSection } from '../report/MarketSection';
import { NewsSection } from '../report/NewsSection';
import { FilingsSection } from '../report/FilingsSection';
import { SocialSection } from '../report/SocialSection';
import { SynthesisSection } from '../report/SynthesisSection';
import { RisksSection } from '../report/RisksSection';
import { ChatFollowup } from '../research/ChatFollowup';
import type {
  FilingsSectionData,
  MarketSectionData,
  NewsSectionData,
  RisksSectionData,
  SocialSectionData,
  SynthesisSectionData,
} from '../../types/research';
import {
  useDeleteReport,
  useReport,
  useUpdateReport,
} from '../../hooks/useReports';

function formatDateTime(iso: string | null | undefined) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString();
}

const SECTION_ORDER = ['market', 'news', 'filings', 'social', 'synthesis', 'risks'] as const;

export function ReportDetailPage() {
  const { reportId } = useParams<{ reportId: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const { data: report, isLoading, isError } = useReport(reportId);
  const updateMutation = useUpdateReport(reportId || '');
  const deleteMutation = useDeleteReport();
  const [tagsOpen, setTagsOpen] = useState(false);
  const [tagInput, setTagInput] = useState('');

  const sections = (report?.sections || {}) as Record<string, unknown>;
  const renderedKeys = useMemo(
    () => SECTION_ORDER.filter((k) => sections[k] !== undefined),
    [sections],
  );

  const addTag = async () => {
    const t = tagInput.trim();
    if (!t || !report) return;
    if ((report.tags || []).includes(t)) {
      setTagInput('');
      return;
    }
    try {
      await updateMutation.mutateAsync({ tags: [...(report.tags || []), t] });
      setTagInput('');
      toast.success('Tag added');
    } catch {
      toast.error('Failed to add tag');
    }
  };

  const removeTag = async (tag: string) => {
    if (!report) return;
    try {
      await updateMutation.mutateAsync({
        tags: (report.tags || []).filter((t) => t !== tag),
      });
    } catch {
      toast.error('Failed to remove tag');
    }
  };

  const onTagKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTag();
    }
  };

  const handleDelete = async () => {
    if (!reportId) return;
    if (
      !window.confirm(
        'Delete this report? This action cannot be undone.',
      )
    )
      return;
    try {
      await deleteMutation.mutateAsync(reportId);
      toast.success('Report deleted');
      navigate('/reports', { replace: true });
    } catch {
      toast.error('Failed to delete report');
    }
  };

  const handleExport = () => window.print();

  return (
    <AppShell>
      <button
        onClick={() => navigate('/reports')}
        className="mb-4 inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-100"
      >
        <ArrowLeft size={14} /> Back to Reports
      </button>

      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <Spinner size="lg" />
        </div>
      )}

      {isError && (
        <Card className="text-center text-sm text-loss">
          Unable to load report.
        </Card>
      )}

      {report && (
        <>
          <div className="sticky top-14 -mx-4 mb-4 border-b border-border-subtle bg-bg-primary/90 px-4 py-3 backdrop-blur md:-mx-6 md:px-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  {(report.companies || []).map((c) => (
                    <Badge key={c} variant="default" className="font-mono">
                      {c}
                    </Badge>
                  ))}
                </div>
                <h1 className="mt-1 text-lg font-semibold text-slate-100">
                  {report.title}
                </h1>
                <p className="mt-0.5 text-xs text-slate-500">
                  {report.query}
                </p>
                <p className="mt-0.5 text-[11px] text-slate-600">
                  Created {formatDateTime(report.createdAt)} · {report.sourceCount} sources ·{' '}
                  {(report.durationMs / 1000).toFixed(1)}s
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  leftIcon={<TagIcon size={14} />}
                  onClick={() => setTagsOpen((v) => !v)}
                >
                  Add Tags
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  leftIcon={<Download size={14} />}
                  onClick={handleExport}
                >
                  Export
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  leftIcon={<Trash2 size={14} />}
                  onClick={handleDelete}
                >
                  Delete
                </Button>
              </div>
            </div>

            {tagsOpen && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {(report.tags || []).map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center gap-1 rounded-full border border-brand-blue/30 bg-brand-blue/10 px-2 py-0.5 text-xs text-brand-glow"
                  >
                    {t}
                    <button
                      onClick={() => removeTag(t)}
                      aria-label={`Remove tag ${t}`}
                      className="text-brand-glow hover:text-slate-100"
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
                <div className="w-48">
                  <Input
                    name="tag-input"
                    placeholder="Type and press Enter…"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={onTagKeyDown}
                  />
                </div>
              </div>
            )}
          </div>

          {renderedKeys.length === 0 ? (
            <Card className="text-center text-sm text-slate-500">
              This report has no sections yet.
            </Card>
          ) : (
            <div className="flex flex-col gap-4">
              {renderedKeys.map((key) => {
                const data = sections[key];
                if (data === undefined) return null;
                if (key === 'market') {
                  return (
                    <MarketSection
                      key={key}
                      data={(data as MarketSectionData) || {}}
                    />
                  );
                }
                if (key === 'news') {
                  return (
                    <NewsSection
                      key={key}
                      data={(data as NewsSectionData) || {}}
                    />
                  );
                }
                if (key === 'filings') {
                  return (
                    <FilingsSection
                      key={key}
                      data={(data as FilingsSectionData) || {}}
                      query={report.query}
                    />
                  );
                }
                if (key === 'social') {
                  return (
                    <SocialSection
                      key={key}
                      data={(data as SocialSectionData) || {}}
                    />
                  );
                }
                if (key === 'synthesis') {
                  return (
                    <SynthesisSection
                      key={key}
                      data={(data as SynthesisSectionData) || {}}
                      companies={report.companies || []}
                    />
                  );
                }
                if (key === 'risks') {
                  return (
                    <RisksSection
                      key={key}
                      data={(data as RisksSectionData) || []}
                    />
                  );
                }
                return null;
              })}
            </div>
          )}

          {renderedKeys.length > 0 && (
            <div className="mt-8 h-[620px] overflow-hidden rounded-2xl border border-border-subtle bg-bg-secondary">
              <ChatFollowup
                reportData={{
                  companies: report.companies || [],
                  sections: report.sections || {},
                  chat_context: {
                    companies: report.companies || [],
                    summary_for_followup:
                      ((report.sections || {}) as Record<string, unknown>)
                        ?.synthesis &&
                      typeof ((report.sections || {}) as Record<string, unknown>)
                        .synthesis === 'object'
                        ? (
                            (
                              (report.sections || {}) as Record<
                                string,
                                { summary?: string }
                              >
                            ).synthesis?.summary || ''
                          ).slice(0, 1500)
                        : '',
                  },
                }}
                reportTitle={report.title}
              />
            </div>
          )}
        </>
      )}
    </AppShell>
  );
}
