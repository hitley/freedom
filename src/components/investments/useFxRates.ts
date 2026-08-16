"use client";

import { useEffect, useState } from "react";
import { HOME_CURRENCY } from "@/lib/money";
import type { FxRates } from "@/lib/investments";

/**
 * Live FX rates for converting foreign-currency holdings into the home currency,
 * with an offline-friendly cache.
 *
 * - **Cache first:** the last-known rates are read from `localStorage` on mount, so
 *   numbers render instantly and keep working with no network (e.g. a UK pension in
 *   GBP still shows its A$ value offline, at the last rate we saw).
 * - **Background refresh:** rates are then fetched from the ECB via frankfurter.dev
 *   (no API key; the request carries only currency codes — none of your data). New
 *   rates update state and re-persist, so converted figures refresh themselves. A
 *   failed fetch silently keeps the cache and flags `offline`.
 * - Re-fetches when the set of needed currencies changes and on window refocus.
 *
 * Rates are keyed by the foreign code, valued as home-currency units per 1 unit of
 * it (GBP→AUD 1.95 ⇒ `{ GBP: 1.95 }`). See `convertToHome` in `@/lib/investments`.
 */
export interface FxState {
  rates: FxRates;
  /** Date the rates are quoted for (YYYY-MM-DD), or null before anything loads. */
  asOf: string | null;
  /** True when the live fetch failed and we're serving cached (or no) rates. */
  offline: boolean;
  loading: boolean;
}

interface CacheShape {
  rates: FxRates;
  asOf: string | null;
}

const cacheKey = (home: string) => `freedom.fx.${home}`;

function readCache(home: string): CacheShape {
  if (typeof window === "undefined") return { rates: {}, asOf: null };
  try {
    const raw = window.localStorage.getItem(cacheKey(home));
    if (!raw) return { rates: {}, asOf: null };
    const parsed = JSON.parse(raw) as CacheShape;
    return { rates: parsed.rates ?? {}, asOf: parsed.asOf ?? null };
  } catch {
    return { rates: {}, asOf: null };
  }
}

function writeCache(home: string, value: CacheShape) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(cacheKey(home), JSON.stringify(value));
  } catch {
    // Best-effort cache; ignore quota/availability failures.
  }
}

/** Fetch one currency's home rate from frankfurter. Throws on network/HTTP error. */
async function fetchRate(
  currency: string,
  home: string,
  signal: AbortSignal,
): Promise<{ rate: number; asOf: string }> {
  // frankfurter.dev is the canonical host; the older .app domain cross-origin
  // 301-redirects here, which browser `fetch` can't follow, so call .dev directly.
  const url = `https://api.frankfurter.dev/v1/latest?from=${currency}&to=${home}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`FX ${currency}->${home}: ${res.status}`);
  const data = (await res.json()) as { date: string; rates: Record<string, number> };
  const rate = data.rates?.[home];
  if (typeof rate !== "number") throw new Error(`FX ${currency}->${home}: no rate`);
  return { rate, asOf: data.date };
}

export function useFxRates(
  currencies: string[],
  home: string = HOME_CURRENCY,
): FxState {
  // Foreign currencies only, de-duped and stable-keyed so the effect only re-runs
  // when the actual set changes (not on every render's fresh array identity).
  const neededKey = Array.from(
    new Set(currencies.map((c) => c.toUpperCase()).filter((c) => c && c !== home)),
  )
    .sort()
    .join(",");

  // Start empty so the server and the client's first render agree — reading the
  // localStorage cache during render would mismatch SSR (the server has no cache)
  // and trip a hydration error. The cache is applied in the effect, post-hydration.
  const [state, setState] = useState<FxState>({
    rates: {},
    asOf: null,
    offline: false,
    loading: false,
  });

  useEffect(() => {
    const needed = neededKey ? neededKey.split(",") : [];
    // Nothing foreign to convert — leave state as-is (the FX note isn't shown then).
    if (needed.length === 0) return;

    let active = true;
    const controller = new AbortController();

    const load = async () => {
      // Defer past the synchronous effect body, then show any cached rates
      // instantly (post-hydration this is safe) before the live fetch resolves.
      await Promise.resolve();
      if (!active) return;
      const cached = readCache(home);
      if (Object.keys(cached.rates).length > 0) {
        setState((s) => ({ ...s, ...cached }));
      }
      try {
        const results = await Promise.all(
          needed.map((c) =>
            fetchRate(c, home, controller.signal).then((r) => [c, r] as const),
          ),
        );
        if (!active) return;
        const rates: FxRates = {};
        for (const [c, r] of results) rates[c] = r.rate;
        // Most recent quote date across the pairs (ECB dates sort lexically).
        const asOf = results.map(([, r]) => r.asOf).sort().at(-1) ?? null;
        const next: CacheShape = { rates, asOf };
        writeCache(home, next);
        setState({ ...next, offline: false, loading: false });
      } catch {
        if (!active) return;
        // Offline/failed — fall back to the cache (already applied above) and flag it.
        setState((s) => ({ ...s, offline: true, loading: false }));
      }
    };

    void load();
    window.addEventListener("focus", load);
    return () => {
      active = false;
      controller.abort();
      window.removeEventListener("focus", load);
    };
  }, [neededKey, home]);

  return state;
}
