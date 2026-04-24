import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from './Button';
import { Card } from './Card';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('ErrorBoundary caught:', error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.reset);
      }
      return (
        <div className="flex min-h-[60vh] items-center justify-center p-6">
          <Card className="flex max-w-md flex-col items-center gap-3 py-10 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-loss/10 text-loss">
              <AlertTriangle size={20} />
            </span>
            <div>
              <p className="text-sm font-semibold text-slate-100">
                Something went wrong
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {this.state.error.message || 'An unexpected error occurred.'}
              </p>
            </div>
            <Button variant="primary" size="sm" onClick={this.reset}>
              Try again
            </Button>
          </Card>
        </div>
      );
    }
    return this.props.children;
  }
}
