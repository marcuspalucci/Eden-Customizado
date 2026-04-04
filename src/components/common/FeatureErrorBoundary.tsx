import React, { Component, ErrorInfo, ReactNode } from 'react';
import { logger } from '../../utils/logger';

interface Props {
  featureName: string;
  children: ReactNode;
  fallback?: ReactNode;
  resetKey?: string | number;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class FeatureErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logger.error(`[FeatureErrorBoundary] ${error.message}`, error, errorInfo);
  }

  public componentDidUpdate(prevProps: Props) {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, error: undefined });
    }
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: undefined });
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex flex-col items-center justify-center h-full p-8 text-center">
          <div className="max-w-sm w-full bg-layer-2 border border-bible-border p-6 rounded-xl shadow-lg">
            <i className="fas fa-exclamation-circle text-3xl text-red-400 mb-4"></i>
            <h3 className="text-lg font-bold text-bible-text mb-2">
              {this.props.featureName} indisponível
            </h3>
            <p className="text-sm text-bible-text-light mb-6">
              Ocorreu um erro nesta funcionalidade. A leitura bíblica continua disponível normalmente.
            </p>
            <button
              onClick={this.handleRetry}
              className="w-full py-2 px-4 bg-bible-accent hover:bg-bible-accent-hover text-white rounded-lg font-semibold transition-all text-sm"
            >
              Tentar novamente
            </button>
            {import.meta.env.DEV && this.state.error && (
              <pre className="mt-4 p-3 bg-gray-100 rounded text-left text-xs overflow-auto max-h-32 text-gray-700">
                {this.state.error.message}
                {'\n'}
                {this.state.error.stack}
              </pre>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
