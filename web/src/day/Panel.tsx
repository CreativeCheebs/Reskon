import type { ReactNode } from "react";
import { palette } from "../theme/palette";

export function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ background: palette.panel, border: `1px solid ${palette.border}`, borderRadius: 8, padding: "12px 16px 16px", fontSize: 13 }}>
      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{title}</div>
      {children}
    </section>
  );
}

export function Heading({ children }: { children: ReactNode }) {
  return <div style={{ color: palette.subtle, fontSize: 11, letterSpacing: 0.6, textTransform: "uppercase", margin: "14px 0 6px" }}>{children}</div>;
}
