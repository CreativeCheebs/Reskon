import React from "react";
import ReactDOM from "react-dom/client";
import { App as AntApp, ConfigProvider, Spin } from "antd";
import { antTheme } from "./theme/antTheme";
import { palette } from "./theme/palette";
import { AppProvider } from "./store";
import { startHealthCheck } from "./api";
import { App } from "./App";
import { AuthGate } from "./auth/AuthGate";

document.body.style.margin = "0";
document.body.style.background = palette.bg;
document.body.style.color = palette.fg;
document.body.style.fontFamily =
  "Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

// Scrollbars and native controls follow the dark palette. `color-scheme`
// covers browsers that ignore the rest (and form controls, date pickers).
const globalStyle = document.createElement("style");
globalStyle.textContent = `
  :root { color-scheme: dark; }
  * { scrollbar-width: thin; scrollbar-color: ${palette.borderStrong} transparent; }
  ::-webkit-scrollbar { width: 10px; height: 10px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb {
    background: ${palette.borderStrong};
    border-radius: 6px;
    border: 2px solid ${palette.bg};
  }
  ::-webkit-scrollbar-thumb:hover { background: ${palette.muted}; }
  ::-webkit-scrollbar-corner { background: transparent; }
`;
document.head.appendChild(globalStyle);

startHealthCheck();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ConfigProvider theme={antTheme}>
      <AntApp>
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
    </ConfigProvider>
  </React.StrictMode>,
);
