import { createContext, useContext } from "react";
import type { ViewBackground } from "../types";

// A view's background image, drawn behind its board or table, and how solid
// the columns and tables over it are. Without an image everything is solid.

const SurfaceOpacity = createContext(1);

/** How solid board columns and tables should be (0-1). */
export const useSurfaceOpacity = () => useContext(SurfaceOpacity);
export const SurfaceOpacityProvider = SurfaceOpacity.Provider;

export function surfaceOpacityOf(bg: ViewBackground): number {
  return bg.image_id ? clamp(bg.surface_opacity ?? 0.85, 0, 1) : 1;
}

/** #rrggbb plus an alpha byte, for a surface over the background. */
export function withAlpha(hex: string, alpha: number): string {
  if (alpha >= 1) return hex;
  return hex + Math.round(clamp(alpha, 0, 1) * 255).toString(16).padStart(2, "0");
}

const SIZE = { cover: "cover", contain: "contain", stretch: "100% 100%" } as const;

/** Fills its positioned parent plus the content area's 14px padding. Blur
 *  is applied to a slightly larger layer so the edges stay sharp instead of
 *  fading to the page colour. */
export function ViewBackdrop({ bg }: { bg: ViewBackground }) {
  if (!bg.image_id) return null;
  const blur = clamp(bg.blur ?? 0, 0, 40);
  return (
    <div aria-hidden style={{ position: "absolute", inset: -14, overflow: "hidden", pointerEvents: "none", zIndex: 0 }}>
      <div
        style={{
          position: "absolute",
          inset: blur ? -blur * 2 : 0,
          backgroundImage: `url(/api/images/${bg.image_id})`,
          backgroundSize: SIZE[bg.fit ?? "cover"],
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
          opacity: clamp(bg.opacity ?? 1, 0, 1),
          filter: blur ? `blur(${blur}px)` : undefined,
        }}
      />
    </div>
  );
}

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, Number.isFinite(n) ? n : lo));
}
