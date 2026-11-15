import type { ReactNode } from "react";
import {
  AppstoreOutlined,
  BarChartOutlined,
  CheckCircleOutlined,
  CoffeeOutlined,
  ExclamationCircleOutlined,
  HeartOutlined,
} from "@ant-design/icons";

// An app's manifest names its icon with one plain word (docs/plugins.md).
// The few words below get a matching icon; any other word gets a generic
// app icon, so an unknown word is never an error.
const BY_WORD: Record<string, ReactNode> = {
  check: <CheckCircleOutlined />,
  food: <CoffeeOutlined />,
  heart: <HeartOutlined />,
  chart: <BarChartOutlined />,
};

/** The icon for an app's manifest icon word; `broken` swaps in a warning so
 *  an app that cannot be reached is not told apart by colour alone. */
export function appIcon(word: string | undefined, broken = false): ReactNode {
  if (broken) return <ExclamationCircleOutlined />;
  return BY_WORD[(word ?? "").trim().toLowerCase()] ?? <AppstoreOutlined />;
}
