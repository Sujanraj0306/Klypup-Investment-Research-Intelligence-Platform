import { useNavigate, useLocation } from 'react-router-dom';
import { Mic, Bell } from 'lucide-react';
import { useAuthContext } from '../../hooks/AuthContext';

const routeTitles: Record<string, string> = {
  '/': 'Dashboard',
  '/research': 'Research',
  '/watchlist': 'Watchlist',
  '/reports': 'Reports',
  '/compare': 'Compare',
};

function titleForPath(pathname: string) {
  if (routeTitles[pathname]) return routeTitles[pathname];
  const base = '/' + pathname.split('/').filter(Boolean)[0];
  return routeTitles[base] || 'Klypup';
}

function initialsOf(
  name: string | null | undefined,
  email: string | null | undefined,
) {
  const source = (name || email || 'U').trim();
  const parts = source.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

export function TopBar() {
  const { user } = useAuthContext();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const title = titleForPath(pathname);

  return (
    <header className="fixed left-[60px] right-0 top-0 z-20 flex h-14 items-center gap-4 border-b border-border-subtle bg-bg-primary/80 px-4 backdrop-blur md:left-[240px] md:px-6">
      <h2 className="text-base font-semibold text-slate-100">{title}</h2>

      <div className="ml-auto flex items-center gap-2">
        <button
          onClick={() => navigate('/research?voice=1')}
          aria-label="Voice research"
          title="Voice research"
          className="rounded-md p-2 text-slate-400 transition-colors hover:bg-bg-tertiary hover:text-brand-glow"
        >
          <Mic size={18} />
        </button>
        <button
          aria-label="Notifications"
          title="Notifications"
          className="relative rounded-md p-2 text-slate-400 transition-colors hover:bg-bg-tertiary hover:text-slate-100"
        >
          <Bell size={18} />
        </button>
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-bg-tertiary text-xs font-semibold text-slate-200">
          {initialsOf(user?.displayName, user?.email)}
        </div>
      </div>
    </header>
  );
}
