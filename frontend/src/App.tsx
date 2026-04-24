import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './hooks/AuthContext';
import { AuthGuard } from './components/auth/AuthGuard';
import { LoginPage } from './components/auth/LoginPage';
import { SignupPage } from './components/auth/SignupPage';
import { DashboardPage } from './components/dashboard/DashboardPage';
import { ToastProvider } from './components/ui/Toast';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { PageSkeleton } from './components/ui/Skeleton';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';

// Heavy pages are code-split — keeps the initial bundle small.
const ResearchPage = lazy(() =>
  import('./components/research/ResearchPage').then((m) => ({
    default: m.ResearchPage,
  })),
);
const ReportsPage = lazy(() =>
  import('./components/reports/ReportsPage').then((m) => ({
    default: m.ReportsPage,
  })),
);
const ReportDetailPage = lazy(() =>
  import('./components/reports/ReportDetailPage').then((m) => ({
    default: m.ReportDetailPage,
  })),
);
const ComparePage = lazy(() =>
  import('./components/compare/ComparePage').then((m) => ({
    default: m.ComparePage,
  })),
);
const WatchlistPage = lazy(() =>
  import('./components/watchlist/WatchlistPage').then((m) => ({
    default: m.WatchlistPage,
  })),
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: 2,
      retryDelay: 1000,
    },
  },
});

function Shortcuts() {
  useKeyboardShortcuts();
  return null;
}

function LazyRoute({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary>
      <Suspense fallback={<PageSkeleton />}>{children}</Suspense>
    </ErrorBoundary>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <BrowserRouter>
          <AuthProvider>
            <Shortcuts />
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/signup" element={<SignupPage />} />
              <Route
                path="/"
                element={
                  <AuthGuard>
                    <DashboardPage />
                  </AuthGuard>
                }
              />
              <Route
                path="/research"
                element={
                  <AuthGuard>
                    <LazyRoute>
                      <ResearchPage />
                    </LazyRoute>
                  </AuthGuard>
                }
              />
              <Route
                path="/watchlist"
                element={
                  <AuthGuard>
                    <LazyRoute>
                      <WatchlistPage />
                    </LazyRoute>
                  </AuthGuard>
                }
              />
              <Route
                path="/reports"
                element={
                  <AuthGuard>
                    <LazyRoute>
                      <ReportsPage />
                    </LazyRoute>
                  </AuthGuard>
                }
              />
              <Route
                path="/reports/:reportId"
                element={
                  <AuthGuard>
                    <LazyRoute>
                      <ReportDetailPage />
                    </LazyRoute>
                  </AuthGuard>
                }
              />
              <Route
                path="/compare"
                element={
                  <AuthGuard>
                    <LazyRoute>
                      <ComparePage />
                    </LazyRoute>
                  </AuthGuard>
                }
              />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}
