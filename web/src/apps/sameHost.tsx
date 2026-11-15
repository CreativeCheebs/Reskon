import { Alert } from "antd";

// Browsers send a site's cookies to every port on the same machine name, so
// an app at http://192.168.0.8:8098 receives Reskon's sign-in cookie from
// http://192.168.0.8:8097 with each request the browser makes to it
// (docs/decisions.md, "An app on the same machine name as Reskon").

/** Whether address is on the machine name this page was loaded from (any port). */
export function onReskonsHost(address: string): boolean {
  try {
    return new URL(address).hostname === window.location.hostname;
  } catch {
    return false;
  }
}

export function SameHostWarning({ address }: { address: string }) {
  if (!onReskonsHost(address)) return null;
  return (
    <Alert
      type="warning"
      showIcon
      style={{ margin: "8px 0" }}
      message="This app runs on the same machine name as Reskon, so it can see your Reskon sign-in. Only connect apps you trust."
    />
  );
}
