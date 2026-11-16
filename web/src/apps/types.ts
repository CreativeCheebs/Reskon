// Connected apps (plugins). The contract is docs/plugins.md; these are the
// shapes GET /api/apps sends. The sign-in token never reaches the browser.

export type AuthKind = "none" | "token" | "password";
export type AppStatus = "ok" | "unreachable" | "invalid";

export interface AppWidget {
  id: string;
  title: string;
  kind: "page" | "data";
  url: string;
  size: { w: number; h: number };
  style?: "reskon" | "own";
  shape?: "number" | "series" | "table" | "checklist" | "list";
  ranged?: boolean;
  groups?: string[];
}

export interface AppManifest {
  reskon_app: number;
  id: string;
  name: string;
  version: string;
  home_url: string;
  icon: string;
  auth: { kind: AuthKind; login_url?: string };
  widgets: AppWidget[];
}

export interface ConnectedApp {
  id: number;
  app_id: string;
  name: string;
  address: string;
  auth_kind: AuthKind;
  signed_in: boolean;
  status: AppStatus;
  status_detail: string;
  checked_at: string;
  manifest: AppManifest | null;
  /** The app's own page as a full address, resolved by the server; empty if it cannot be. */
  home_link: string;
  /** Whether the app took Reskon's key for saying "my data changed" from its
   *  own server: "" (it does not offer that), "ok", or "failed" with changes_detail. */
  changes: "" | "ok" | "failed";
  changes_detail: string;
}

export interface Credentials {
  token?: string;
  username?: string;
  password?: string;
}

/** What POST /api/apps/launch answers for an app page widget: the page's
 *  address (with a one-minute sign-in ticket after "#" when the app signs
 *  in) and its origin, the only address Reskon sends it messages to. */
export interface PageLink {
  url: string;
  origin: string;
  style: "reskon" | "own";
  title: string;
}
