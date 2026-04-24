import { useMemo } from 'react';

interface SentimentGaugeProps {
  score: number; // 0-100
  label: string;
  articleCount?: number;
  breakdown?: { positive: number; neutral: number; negative: number };
}

const TAU = Math.PI; // 180° sweep

function colorForScore(score: number) {
  if (score >= 67) return '#10B981';
  if (score >= 34) return '#F59E0B';
  return '#EF4444';
}

export function SentimentGauge({
  score,
  label,
  articleCount,
  breakdown,
}: SentimentGaugeProps) {
  const clamped = Math.max(0, Math.min(100, score));
  const color = colorForScore(clamped);

  const arc = useMemo(() => {
    const startAngle = Math.PI;
    const endAngle = Math.PI + (TAU * clamped) / 100;
    const radius = 64;
    const cx = 80;
    const cy = 80;
    const x1 = cx + radius * Math.cos(startAngle);
    const y1 = cy + radius * Math.sin(startAngle);
    const x2 = cx + radius * Math.cos(endAngle);
    const y2 = cy + radius * Math.sin(endAngle);
    const largeArc = clamped > 50 ? 1 : 0;
    return `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`;
  }, [clamped]);

  const bgArc = useMemo(() => {
    const cx = 80;
    const cy = 80;
    const radius = 64;
    const x1 = cx - radius;
    const y1 = cy;
    const x2 = cx + radius;
    const y2 = cy;
    return `M ${x1} ${y1} A ${radius} ${radius} 0 0 1 ${x2} ${y2}`;
  }, []);

  const total = breakdown
    ? breakdown.positive + breakdown.neutral + breakdown.negative || 1
    : 1;

  return (
    <div className="flex flex-col items-center gap-2">
      <svg width={160} height={96} viewBox="0 0 160 96">
        <path d={bgArc} stroke="#1C2333" strokeWidth={12} fill="none" />
        <path
          d={arc}
          stroke={color}
          strokeWidth={12}
          strokeLinecap="round"
          fill="none"
          style={{ transition: 'stroke-dasharray 0.6s ease' }}
        />
        <text
          x={80}
          y={72}
          textAnchor="middle"
          className="fill-slate-100 font-mono"
          fontSize={22}
          fontWeight={700}
        >
          {Math.round(clamped)}
        </text>
        <text
          x={80}
          y={88}
          textAnchor="middle"
          className="fill-slate-500"
          fontSize={10}
        >
          Sentiment · {label}
        </text>
      </svg>
      {breakdown && (
        <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-bg-tertiary">
          <div
            className="h-full bg-gain"
            style={{ width: `${(breakdown.positive / total) * 100}%` }}
            title={`${breakdown.positive} positive`}
          />
          <div
            className="h-full bg-neutral"
            style={{ width: `${(breakdown.neutral / total) * 100}%` }}
            title={`${breakdown.neutral} neutral`}
          />
          <div
            className="h-full bg-loss"
            style={{ width: `${(breakdown.negative / total) * 100}%` }}
            title={`${breakdown.negative} negative`}
          />
        </div>
      )}
      {articleCount !== undefined && (
        <p className="text-[11px] text-slate-500">
          Based on {articleCount} article{articleCount === 1 ? '' : 's'}
        </p>
      )}
    </div>
  );
}
