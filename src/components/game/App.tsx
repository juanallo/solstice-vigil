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
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            background: "#0b0a09",
            color: "#f5f1e8",
            textAlign: "center",
            padding: "2rem",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          <div style={{ fontSize: "2.5rem", marginBottom: "1rem" }}>⚠</div>
          <h1 style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>the vigil stumbled</h1>
          <p
            style={{
              opacity: 0.7,
              maxWidth: "28rem",
              marginBottom: "1.5rem",
              fontSize: "0.875rem",
            }}
          >
            {String(this.state.error.message || this.state.error)}
          </p>
          <button
            onClick={() => location.reload()}
            style={{
              padding: "0.6rem 1.2rem",
              borderRadius: "0.5rem",
              border: "1px solid #f5f1e8",
              background: "transparent",
              color: "#f5f1e8",
              cursor: "pointer",
            }}
          >
            begin again
          </button>
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
