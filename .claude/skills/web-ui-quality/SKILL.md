---
name: web-ui-quality
description: Build or review JitterBug's React and Ant Design web interface, theme consistency, accessibility, and browser behavior.
---
# Web UI workflow

1. Read the relevant React components, `web/src/theme/antTheme.ts`, `palette.ts`, and the applicable `SPEC.md` sections.
2. Keep Ant Design 5 as the component library; use the existing theme tokens and lazy-load large chart/grid features where appropriate.
3. Preserve server-owned calculations and filters. The frontend formats/displays API results; it must not recalculate domain metrics.
4. Cover loading, empty, error, offline/server unavailable, and authenticated states.
5. Check accessible names, keyboard operation, contrast, responsive layout, light/dark and named themes.
6. Run `cd web && npm run typecheck && npm run build`; run Playwright checks only against a test server and disposable account.
7. Update `SPEC.md` if observable behavior changes.
