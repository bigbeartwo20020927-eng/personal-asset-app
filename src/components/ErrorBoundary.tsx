import { Component, type ReactNode } from 'react';

/** 頁面發生錯誤時顯示錯誤訊息，而不是整個畫面空白 */
export default class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error(error);
  }

  componentDidUpdate(prev: { resetKey?: string }) {
    // 換到別的頁面時清掉錯誤
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="card border border-red-200">
        <h2 className="mb-2 font-semibold text-red-700">這個頁面發生錯誤</h2>
        <p className="mb-2 text-sm text-slate-600">請把這個畫面截圖給開發者。</p>
        <pre className="max-h-64 overflow-auto rounded bg-slate-50 p-2 text-xs whitespace-pre-wrap text-slate-700">
          {this.state.error.message}
          {'\n\n'}
          {this.state.error.stack}
        </pre>
      </div>
    );
  }
}
