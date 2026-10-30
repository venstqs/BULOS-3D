import { Component } from 'react';

/**
 * Keeps one broken part (usually WebGL / the 3D map) from blanking the whole
 * page, and shows the actual error so it can be reported.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[Bulos 3D]', this.props.label ?? 'component', 'crashed:', error, info?.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const { label = 'This part of the page', compact = false, onDisable } = this.props;
    return (
      <div role="alert" className={`flex h-full flex-col items-start justify-center gap-2 ${compact ? 'p-4' : 'glass m-4 p-6'} text-sm`}>
        <b className="font-display text-base">{label} stopped working</b>
        <span className="text-ink-2">The rest of Bulos 3D still works. Error: <code className="text-[#a32626]">{String(error.message || error)}</code></span>
        <div className="flex gap-2">
          <button onClick={() => this.setState({ error: null })} className="btn-ghost">Try again</button>
          {onDisable && <button onClick={onDisable} className="btn-primary">Turn off the 3D map</button>}
          {!compact && <button onClick={() => window.location.reload()} className="btn-primary">Reload page</button>}
        </div>
      </div>
    );
  }
}
