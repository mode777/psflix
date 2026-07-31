import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = {
  children: ReactNode;
  fallback?: (err: Error, reset: () => void) => ReactNode;
};

type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error('ErrorBoundary caught:', error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (error) {
      if (this.props.fallback) return this.props.fallback(error, this.reset);
      return (
        <main className="pt-32 px-margin-mobile md:px-margin-desktop max-w-container-max mx-auto text-center">
          <h1 className="text-headline-xl-mobile md:text-headline-xl text-on-surface">
            Something went wrong
          </h1>
          <p className="text-on-surface-variant font-body-md mt-4 max-w-prose mx-auto">
            {error.message || 'An unexpected error occurred.'}
          </p>
          <button
            type="button"
            onClick={this.reset}
            className="mt-6 inline-block px-6 py-2 rounded-lg bg-primary text-on-primary font-semibold hover:bg-primary/90 transition-colors"
          >
            Try again
          </button>
        </main>
      );
    }
    return this.props.children;
  }
}
