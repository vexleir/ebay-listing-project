import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Optional label shown in the fallback so users know which area failed. */
  area?: string;
  /** Remounts the boundary's children when this key changes (e.g. active tab). */
  resetKey?: string | number;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Catches render-time errors in its child tree so a single component crash
 * shows an inline error message instead of blanking the entire app.
 *
 * React unmounts the whole tree when an error is thrown during render and no
 * boundary catches it — which is what produced the "flash then blank page"
 * behavior. This boundary contains the damage and surfaces the actual error.
 */
export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Surface the error to the console for debugging.
    console.error('[ErrorBoundary]', this.props.area || 'unknown area', error, info.componentStack);
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    // Reset error state when the resetKey changes (e.g. user switches tabs)
    // so a crash on one tab doesn't permanently break the others.
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, error: null });
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="glass-panel" style={{ padding: '2rem', maxWidth: '640px', margin: '2rem auto', textAlign: 'center' }}>
          <h3 style={{ margin: '0 0 0.5rem', color: '#ef4444' }}>
            Something went wrong{this.props.area ? ` in ${this.props.area}` : ''}
          </h3>
          <p style={{ margin: '0 0 1rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            This section hit an unexpected error. The rest of the app is still usable.
          </p>
          {this.state.error && (
            <pre
              style={{
                textAlign: 'left',
                background: 'rgba(0,0,0,0.3)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                padding: '0.75rem',
                fontSize: '0.78rem',
                color: '#fca5a5',
                overflowX: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {this.state.error.message}
            </pre>
          )}
          <button
            className="btn-secondary"
            onClick={this.handleReset}
            style={{ marginTop: '1rem', fontSize: '0.85rem', padding: '0.5rem 1.25rem' }}
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
