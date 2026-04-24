import { useCallback, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Download, Trophy } from 'lucide-react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { cn } from '../../lib/cn';
import { fmtPrice, fmtRatioAsPct, fmtUsdLarge } from '../../lib/format';
import type { MarketCompanyData } from '../../types/research';

interface CompareMetricsTableProps {
  companies: MarketCompanyData[];
}

interface MetricDef {
  key: keyof MarketCompanyData;
  label: string;
  format: (v: unknown) => string;
  higherIsBetter?: boolean;
}

const METRICS: MetricDef[] = [
  { key: 'pe_ratio', label: 'P/E (TTM)', format: (v) => (typeof v === 'number' ? `${v.toFixed(1)}x` : '—'), higherIsBetter: false },
  { key: 'forward_pe', label: 'Forward P/E', format: (v) => (typeof v === 'number' ? `${v.toFixed(1)}x` : '—'), higherIsBetter: false },
  { key: 'revenue', label: 'Revenue (TTM)', format: (v) => fmtUsdLarge(v as number | null | undefined), higherIsBetter: true },
  { key: 'revenue_growth', label: 'Revenue growth', format: (v) => fmtRatioAsPct(v as number | null | undefined), higherIsBetter: true },
  { key: 'eps', label: 'EPS', format: (v) => fmtPrice(v as number | null | undefined), higherIsBetter: true },
  { key: 'gross_margins', label: 'Gross margin', format: (v) => fmtRatioAsPct(v as number | null | undefined), higherIsBetter: true },
  { key: 'profit_margins', label: 'Net margin', format: (v) => fmtRatioAsPct(v as number | null | undefined), higherIsBetter: true },
  { key: 'market_cap', label: 'Market cap', format: (v) => fmtUsdLarge(v as number | null | undefined), higherIsBetter: true },
  { key: 'week_52_high', label: '52W high', format: (v) => fmtPrice(v as number | null | undefined) },
  { key: 'beta', label: 'Beta', format: (v) => (typeof v === 'number' ? v.toFixed(2) : '—') },
];

type SortKey = 'metric' | string;

function asNumber(v: unknown): number | null {
  return typeof v === 'number' && !Number.isNaN(v) ? v : null;
}

function exportCsv(rows: string[][]) {
  const csv = rows
    .map((r) => r.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `klypup-comparison-${Date.now()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function CompareMetricsTable({ companies }: CompareMetricsTableProps) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({
    key: 'metric',
    dir: 'asc',
  });

  const winners = useMemo(() => {
    const out: Record<string, string | null> = {};
    for (const m of METRICS) {
      const values = companies
        .map((c) => ({ symbol: c.symbol, v: asNumber(c[m.key]) }))
        .filter((x) => x.v !== null) as Array<{ symbol: string; v: number }>;
      if (values.length < 2 || m.higherIsBetter === undefined) {
        out[m.label] = null;
        continue;
      }
      const picked =
        m.higherIsBetter
          ? values.reduce((a, b) => (a.v > b.v ? a : b))
          : values.reduce((a, b) => (a.v < b.v ? a : b));
      out[m.label] = picked.symbol;
    }
    return out;
  }, [companies]);

  const sortedMetrics = useMemo(() => {
    const copy = [...METRICS];
    if (sort.key === 'metric') {
      copy.sort((a, b) =>
        sort.dir === 'asc'
          ? a.label.localeCompare(b.label)
          : b.label.localeCompare(a.label),
      );
    } else {
      const symbol = sort.key;
      copy.sort((a, b) => {
        const va = asNumber(
          companies.find((c) => c.symbol === symbol)?.[a.key],
        );
        const vb = asNumber(
          companies.find((c) => c.symbol === symbol)?.[b.key],
        );
        if (va === null && vb === null) return 0;
        if (va === null) return 1;
        if (vb === null) return -1;
        return sort.dir === 'asc' ? va - vb : vb - va;
      });
    }
    return copy;
  }, [sort, companies]);

  const toggleSort = useCallback((key: SortKey) => {
    setSort((prev) => ({
      key,
      dir: prev.key === key && prev.dir === 'asc' ? 'desc' : 'asc',
    }));
  }, []);

  const handleExport = useCallback(() => {
    const header = ['Metric', ...companies.map((c) => c.symbol), 'Winner'];
    const rows = sortedMetrics.map((m) => [
      m.label,
      ...companies.map((c) => m.format(c[m.key])),
      winners[m.label] || '—',
    ]);
    exportCsv([header, ...rows]);
  }, [companies, sortedMetrics, winners]);

  const sortIndicator = (key: SortKey) =>
    sort.key === key ? (
      sort.dir === 'asc' ? (
        <ArrowUp size={10} />
      ) : (
        <ArrowDown size={10} />
      )
    ) : null;

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-100">
          Metrics Comparison
        </h3>
        <Button
          size="sm"
          variant="secondary"
          leftIcon={<Download size={14} />}
          onClick={handleExport}
        >
          Export CSV
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border-subtle">
        <table className="min-w-full text-xs">
          <thead className="bg-bg-tertiary text-slate-400">
            <tr>
              <th
                onClick={() => toggleSort('metric')}
                className="cursor-pointer p-2 text-left font-medium select-none"
              >
                <span className="inline-flex items-center gap-1">
                  Metric {sortIndicator('metric')}
                </span>
              </th>
              {companies.map((c) => (
                <th
                  key={c.symbol}
                  onClick={() => toggleSort(c.symbol)}
                  className="cursor-pointer p-2 text-right font-mono text-slate-300 select-none"
                >
                  <span className="inline-flex items-center gap-1">
                    {c.symbol} {sortIndicator(c.symbol)}
                  </span>
                </th>
              ))}
              <th className="p-2 text-right font-medium">Winner</th>
            </tr>
          </thead>
          <tbody>
            {sortedMetrics.map((m) => {
              const winner = winners[m.label];
              return (
                <tr key={m.label} className="border-t border-border-subtle">
                  <td className="p-2 text-slate-400">{m.label}</td>
                  {companies.map((c) => (
                    <td
                      key={c.symbol + m.label}
                      className={cn(
                        'p-2 text-right font-mono text-slate-200',
                        winner === c.symbol && 'bg-gain/10 text-gain',
                      )}
                    >
                      {m.format(c[m.key])}
                    </td>
                  ))}
                  <td className="p-2 text-right text-[11px]">
                    {winner ? (
                      <span className="inline-flex items-center gap-1 text-gain">
                        <Trophy size={10} /> {winner}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
