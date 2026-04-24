import { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { useSectorHeatmap } from '../../hooks/useMarketData';
import { colorForChange, HEATMAP_LEGEND_STOPS } from '../../lib/heatmapScale';
import { Badge } from '../ui/Badge';
import { Card } from '../ui/Card';
import { cn } from '../../lib/cn';
import type { SectorData } from '../../types';

interface TileDatum {
  name: string;
  symbol: string;
  changePct: number | null;
  value: number;
}

const WIDTH_FALLBACK = 960;
const HEIGHT = 260;

function formatPct(v: number | null | undefined) {
  if (v == null || Number.isNaN(v)) return '—';
  const sign = v >= 0 ? '+' : '';
  return `${sign}${v.toFixed(2)}%`;
}

export function SectorHeatmap() {
  const { data, isLoading, isError, dataUpdatedAt, refetch } =
    useSectorHeatmap();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hover, setHover] = useState<{
    x: number;
    y: number;
    datum: TileDatum;
  } | null>(null);
  const [width, setWidth] = useState<number>(WIDTH_FALLBACK);

  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        if (e.contentRect.width > 0) setWidth(e.contentRect.width);
      }
    });
    ro.observe(el);
    setWidth(el.clientWidth || WIDTH_FALLBACK);
    return () => ro.disconnect();
  }, []);

  const tiles: TileDatum[] = useMemo(() => {
    if (!data) return [];
    return data.map((s: SectorData) => ({
      name: s.sectorName,
      symbol: s.symbol,
      changePct: s.changePct,
      value:
        typeof s.marketCapWeight === 'number' && s.marketCapWeight > 0
          ? s.marketCapWeight
          : 1,
    }));
  }, [data]);

  useEffect(() => {
    if (!svgRef.current || tiles.length === 0 || width === 0) return;
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    svg
      .attr('width', width)
      .attr('height', HEIGHT)
      .attr('viewBox', `0 0 ${width} ${HEIGHT}`);

    const root = d3
      .hierarchy<{ children: TileDatum[] }>({ children: tiles } as {
        children: TileDatum[];
      })
      .sum((d) => (d as unknown as TileDatum).value || 0)
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

    d3
      .treemap<{ children: TileDatum[] }>()
      .size([width, HEIGHT])
      .padding(2)
      .round(true)(root);

    const leaves = root.leaves() as Array<
      d3.HierarchyRectangularNode<{ children: TileDatum[] }> & {
        data: TileDatum;
      }
    >;

    const g = svg
      .selectAll('g.tile')
      .data(leaves)
      .enter()
      .append('g')
      .attr('class', 'tile')
      .attr('transform', (d) => `translate(${d.x0},${d.y0})`)
      .style('cursor', 'default');

    g.append('rect')
      .attr('width', (d) => Math.max(0, d.x1 - d.x0))
      .attr('height', (d) => Math.max(0, d.y1 - d.y0))
      .attr('rx', 4)
      .attr('fill', (d) => colorForChange(d.data.changePct))
      .attr('stroke', '#0A0E1A')
      .attr('stroke-width', 1);

    g.append('text')
      .attr('x', 10)
      .attr('y', 20)
      .attr('fill', '#F8FAFC')
      .attr('font-size', 13)
      .attr('font-weight', 600)
      .style('pointer-events', 'none')
      .text((d) => {
        const w = d.x1 - d.x0;
        if (w < 60) return d.data.symbol;
        if (w < 120) return d.data.name.split(' ')[0];
        return d.data.name;
      });

    g.append('text')
      .attr('x', 10)
      .attr('y', 38)
      .attr('fill', (d) =>
        d.data.changePct == null
          ? '#94A3B8'
          : d.data.changePct >= 0
            ? '#86EFAC'
            : '#FCA5A5',
      )
      .attr('font-size', 12)
      .attr('font-family', 'JetBrains Mono, monospace')
      .style('pointer-events', 'none')
      .text((d) => formatPct(d.data.changePct));

    g.on('mousemove', function (event, d) {
      const [mx, my] = d3.pointer(event, containerRef.current);
      setHover({ x: mx, y: my, datum: d.data });
    }).on('mouseleave', () => setHover(null));
  }, [tiles, width]);

  const lastUpdated = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';

  return (
    <Card className="overflow-hidden">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-100">
            S&amp;P 500 Sectors
          </h3>
          <p className="text-xs text-slate-500">
            Daily change by sector ETF.{' '}
            <button
              onClick={() => refetch()}
              className="text-brand-glow hover:underline"
            >
              Refresh
            </button>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="info">15 min delay</Badge>
          <span className="text-xs text-slate-500">Updated {lastUpdated}</span>
        </div>
      </div>

      <div
        ref={containerRef}
        className="relative overflow-hidden rounded-lg"
        style={{ height: HEIGHT }}
      >
        {isLoading && (
          <div className="grid h-full grid-cols-4 grid-rows-3 gap-1">
            {Array.from({ length: 11 }).map((_, i) => (
              <div
                key={i}
                className={cn(
                  'animate-pulse rounded-md bg-bg-tertiary',
                  i === 0 && 'col-span-2 row-span-2',
                )}
              />
            ))}
          </div>
        )}
        {isError && (
          <div className="flex h-full items-center justify-center text-sm text-loss">
            Unable to load sector data.
          </div>
        )}
        {!isLoading && !isError && tiles.length === 0 && (
          <div className="flex h-full items-center justify-center text-sm text-slate-500">
            No sector data available right now.
          </div>
        )}
        {!isLoading && !isError && tiles.length > 0 && (
          <svg ref={svgRef} role="img" aria-label="Sector heatmap" />
        )}

        {hover && (
          <div
            className="pointer-events-none absolute z-10 min-w-[180px] rounded-lg border border-border-default bg-bg-elevated px-3 py-2 text-xs shadow-xl"
            style={{
              left: Math.min(Math.max(hover.x + 12, 8), width - 200),
              top: Math.max(hover.y - 12, 8),
            }}
          >
            <p className="font-semibold text-slate-100">{hover.datum.name}</p>
            <p className="font-mono text-[11px] text-slate-400">
              {hover.datum.symbol}
            </p>
            <p
              className={cn(
                'mt-1 font-mono',
                (hover.datum.changePct ?? 0) >= 0
                  ? 'text-gain'
                  : 'text-loss',
              )}
            >
              {formatPct(hover.datum.changePct)}
            </p>
          </div>
        )}
      </div>

      <div className="mt-3 flex items-center gap-2 text-[11px] text-slate-500">
        <span>Lower</span>
        <div className="flex flex-1 overflow-hidden rounded-sm">
          {HEATMAP_LEGEND_STOPS.map(([pct, color]) => (
            <div
              key={pct}
              title={`${pct >= 0 ? '+' : ''}${pct}%`}
              className="h-2 flex-1"
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
        <span>Higher</span>
      </div>
      <div className="mt-1 flex justify-between px-[9%] text-[10px] text-slate-600">
        <span>-3%</span>
        <span>0%</span>
        <span>+3%</span>
      </div>
    </Card>
  );
}
