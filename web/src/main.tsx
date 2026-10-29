import React from "react";
import ReactDOM from "react-dom/client";
import { App as AntApp, Spin } from "antd";
import { AppProvider } from "./store";
import { startHealthCheck } from "./api";
import { App } from "./App";
import { AuthGate } from "./auth/AuthGate";
import { FeedbackBridge } from "./theme/feedback";
import { ThemeProvider } from "./theme/ThemeProvider";

document.body.style.margin = "0";
document.body.style.fontFamily = "Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

startHealthCheck();

// ThemeProvider sets the palette, Ant tokens, body colours and scrollbars,
// and re-renders this whole tree when the theme changes.
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider>
      {() => (
        <AntApp>
          <FeedbackBridge />
          <AuthGate>
            <AppProvider
              fallback={
                <div style={{ display: "grid", placeItems: "center", height: "100vh" }}>
                  <Spin />
                </div>
              }
            >
              <App />
            </AppProvider>
          </AuthGate>
        </AntApp>
      )}
    </ThemeProvider>
  </React.StrictMode>,
);
