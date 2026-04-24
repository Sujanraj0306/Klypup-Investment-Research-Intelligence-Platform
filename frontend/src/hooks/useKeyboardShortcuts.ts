import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/**
 * Global shortcuts:
 *   ⌘K / Ctrl+K → go to /research (and focus query via ?focus=1)
 */
export function useKeyboardShortcuts() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const cmd = e.metaKey || e.ctrlKey;
      if (cmd && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (location.pathname !== '/research') {
          navigate('/research?focus=1');
        } else {
          // Dispatch a custom event for the page to handle.
          window.dispatchEvent(new CustomEvent('klypup:focus-query'));
        }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate, location.pathname]);
}
