import { Component, type ReactNode } from "react";
import SolsticeVigil from "./SolsticeVigil";

type EBState = { error: Error | null };

class ErrorBoundary extends Component<{ children: ReactNode }, EBState> {
  state: EBState = { error: null };
  static getDerivedStateFromError(error: Error): EBState {
    return { error };
  }
  componentDidCatch(error: Error) {
    console.error("SolsticeVigil render error:", error);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="sv-root">
          <div className="sv-container sv-container--narrow">
            <div className="sv-screen-center">
              <div className="sv-panel" style={{ textAlign: "center" }}>
                <div className="sv-loading-sigil" aria-hidden="true">⚠</div>
                <h1 className="sv-heading">the vigil stumbled</h1>
                <p className="sv-note" style={{ marginTop: "1rem", maxWidth: "28rem", marginLeft: "auto", marginRight: "auto" }}>
                  {String(this.state.error.message || this.state.error)}
                </p>
                <div className="sv-actions">
                  <button type="button" onClick={() => location.reload()} className="sv-button-secondary">
                    begin again
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <SolsticeVigil />
    </ErrorBoundary>
  );
}
