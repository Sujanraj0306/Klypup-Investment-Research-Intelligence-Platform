import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Search,
  Star,
  Archive,
  BarChart2,
  LogOut,
  type LucideIcon,
} from 'lucide-react';
import { useAuthContext } from '../../hooks/AuthContext';
import { useOrg } from '../../hooks/useOrg';
import { Badge } from '../ui/Badge';
import { cn } from '../../lib/cn';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  badge?: string;
  end?: boolean;
}

const navItems: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/research', label: 'Research', icon: Search },
  { to: '/watchlist', label: 'Watchlist', icon: Star },
  { to: '/reports', label: 'Reports', icon: Archive },
  { to: '/compare', label: 'Compare', icon: BarChart2, badge: 'Beta' },
];

function initialsOf(name: string | null | undefined, email: string | null | undefined) {
  const source = (name || email || 'U').trim();
  const parts = source.split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

export function Sidebar() {
  const { user, orgId, logout } = useAuthContext();
  const { metadata } = useOrg(orgId);
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <aside className="fixed inset-y-0 left-0 z-30 flex w-[60px] flex-col border-r border-border-subtle bg-bg-secondary md:w-[240px]">
      <div className="flex h-14 items-center gap-2 border-b border-border-subtle px-3 md:px-5">
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-brand-blue font-bold text-white">
          K
        </div>
        <span className="hidden text-lg font-semibold text-slate-100 md:inline">
          Klypup
        </span>
      </div>

      <nav className="flex-1 overflow-y-auto py-3">
        <ul className="flex flex-col gap-0.5 px-2">
          {navItems.map(({ to, label, icon: Icon, badge, end }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    'group relative flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-bg-tertiary text-brand-glow'
                      : 'text-slate-400 hover:bg-bg-tertiary hover:text-slate-100',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <span
                        aria-hidden="true"
                        className="absolute left-0 top-1 bottom-1 w-1 rounded-r bg-brand-blue"
                      />
                    )}
                    <Icon size={18} className="flex-shrink-0" />
                    <span className="hidden flex-1 md:inline">{label}</span>
                    {badge && (
                      <Badge variant="info" className="hidden md:inline-flex">
                        {badge}
                      </Badge>
                    )}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="border-t border-border-subtle p-3">
        <div className="hidden md:block">
          <p className="truncate text-[11px] uppercase tracking-wider text-slate-500">
            {metadata?.name || 'Workspace'}
          </p>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-bg-tertiary text-xs font-semibold text-slate-200">
            {initialsOf(user?.displayName, user?.email)}
          </div>
          <div className="hidden min-w-0 flex-1 md:block">
            <p className="truncate text-sm font-medium text-slate-100">
              {user?.displayName || user?.email || 'Signed in'}
            </p>
            <p className="truncate text-xs text-slate-500">
              {user?.email || ''}
            </p>
          </div>
          <button
            onClick={handleLogout}
            title="Log out"
            aria-label="Log out"
            className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-loss/10 hover:text-loss"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
}
