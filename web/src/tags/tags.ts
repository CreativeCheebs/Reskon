import { useCallback, useMemo } from "react";
import { useApp } from "../store";
import type { Tag } from "../types";

// Tags: short free words on tasks and sessions. The server owns the rules
// (internal/db/tags.go); these helpers only tidy what is typed so it is not
// refused for something small, and show the names.

export const MAX_TAG_LENGTH = 32;
export const MAX_TAGS = 20;

/** A typed tag, tidied: no leading "#", single spaces, trimmed. */
export function cleanTag(s: string): string {
  return s.trim().replace(/^#+/, "").trim().replace(/\s+/g, " ");
}

/** Why a tidied tag would be refused, or null when it is fine. */
export function tagProblem(s: string): string | null {
  if (!s) return "A tag needs a name.";
  if (s.length > MAX_TAG_LENGTH) return `A tag can have at most ${MAX_TAG_LENGTH} characters.`;
  if (s.includes(",")) return "A tag cannot have a comma.";
  return null;
}

/** Tidied tags, the unusable ones dropped, the same tag in other capitals once, at most 20. */
export function cleanTags(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const t = cleanTag(raw);
    if (tagProblem(t) || seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase());
    out.push(t);
  }
  return out.slice(0, MAX_TAGS);
}

/** The tag list from Settings, and the names of tag ids. */
export function useTags() {
  const { boot, reloadBootstrap } = useApp();
  const bootTags = boot.tags;
  const tags: Tag[] = useMemo(() => bootTags ?? [], [bootTags]);
  const byId = useMemo(() => new Map(tags.map((t) => [t.id, t])), [tags]);
  const namesOf = useCallback((ids: number[] | undefined) => (ids ?? []).map((id) => byId.get(id)?.name).filter((n): n is string => !!n), [byId]);
  const known = useMemo(() => new Set(tags.map((t) => t.name.toLowerCase())), [tags]);
  /** Call after saving tag names: reloads the list when one of them is new, so it shows up everywhere. */
  const refreshIfNew = useCallback(
    (names: string[]) => {
      if (names.some((n) => !known.has(n.toLowerCase()))) reloadBootstrap().catch(() => undefined);
    },
    [known, reloadBootstrap],
  );
  return { tags, byId, namesOf, refreshIfNew };
}
