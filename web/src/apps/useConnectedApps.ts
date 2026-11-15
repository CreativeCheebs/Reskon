import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { useApp } from "../store";
import type { ConnectedApp } from "./types";

/**
 * The person's connected apps, for the sidebar. It reloads when `reloadKey`
 * changes, so connecting or removing an app in another tab shows up here
 * (the server sends a live note for it). A failed load keeps the last list:
 * a dropped connection should not make the Apps heading vanish.
 */
export function useConnectedApps(): ConnectedApp[] {
  const { reloadKey } = useApp();
  const [list, setList] = useState<ConnectedApp[]>([]);
  // Only the newest answer counts, so a slow old one cannot bring back an app just removed.
  const seq = useRef(0);

  useEffect(() => {
    const n = ++seq.current;
    api
      .get<ConnectedApp[]>("/apps")
      .then((l) => n === seq.current && setList(l))
      .catch(() => undefined);
  }, [reloadKey]);

  return list;
}
