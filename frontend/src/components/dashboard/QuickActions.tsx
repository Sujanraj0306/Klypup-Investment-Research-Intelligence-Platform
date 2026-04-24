import { useNavigate } from 'react-router-dom';
import { Zap, BarChart2, FileText, TrendingUp, type LucideIcon } from 'lucide-react';
import { Card } from '../ui/Card';
import { cn } from '../../lib/cn';

interface ActionButtonProps {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  accent?: boolean;
}

function ActionButton({
  icon: Icon,
  label,
  onClick,
  accent = false,
}: ActionButtonProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex h-20 flex-col items-center justify-center gap-1.5 rounded-lg border border-border-subtle bg-bg-tertiary text-sm font-medium text-slate-200 transition-colors hover:border-border-default hover:bg-bg-elevated',
        accent && 'border-brand-blue/40 text-brand-glow hover:border-brand-blue',
      )}
    >
      <Icon size={20} />
      <span>{label}</span>
    </button>
  );
}

export function QuickActions() {
  const navigate = useNavigate();

  const scrollToHeatmap = () => {
    const el = document.getElementById('sector-heatmap');
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <Card className="h-full">
      <h3 className="mb-3 text-sm font-semibold text-slate-100">
        Quick Actions
      </h3>
      <div className="grid grid-cols-2 gap-3">
        <ActionButton
          icon={Zap}
          label="New Research"
          onClick={() => navigate('/research')}
          accent
        />
        <ActionButton
          icon={BarChart2}
          label="Compare Companies"
          onClick={() => navigate('/compare')}
        />
        <ActionButton
          icon={FileText}
          label="Browse Reports"
          onClick={() => navigate('/reports')}
        />
        <ActionButton
          icon={TrendingUp}
          label="Market Overview"
          onClick={scrollToHeatmap}
        />
      </div>
    </Card>
  );
}
