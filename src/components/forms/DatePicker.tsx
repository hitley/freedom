"use client";

/**
 * A calendar-popover date picker that replaces the native `<input type="date">`.
 * It drills across three zoom levels — **day** grid → **month** grid → **year**
 * grid — so you can jump years/months quickly instead of clicking a stepper. The
 * header title climbs a level (day→month→year); picking a cell descends again
 * (year→month→day), and picking a day commits and closes.
 *
 * Drop-in for the old `DateInput`: `value` is an ISO `YYYY-MM-DD` string ("" when
 * unset) and `onChange` emits the same. Dates round-trip through the buckets
 * recurrence engine's `parseISO`/`toISO` so they stay at local midnight (no UTC
 * off-by-one). The popover renders through a portal, so an editor modal's own
 * scroll/overflow can't clip it.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { parseISO, toISO } from "@/lib/buckets";

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

type ViewMode = "day" | "month" | "year";

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

/** Monday-based weekday index (0 = Mon … 6 = Sun). */
const mondayIndex = (d: Date) => (d.getDay() + 6) % 7;

/** The 12-year block a year sits in, e.g. 2026 → [2016 … 2027] for the grid. */
const yearBlockStart = (year: number) => Math.floor(year / 12) * 12;

const triggerClass =
  "w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-left text-sm text-foreground outline-none transition-colors focus:border-emerald data-[placeholder=true]:text-muted/50";

export function DatePicker({
  value,
  onChange,
  placeholder = "Pick a date",
}: {
  value: string;
  onChange: (iso: string) => void;
  placeholder?: string;
}) {
  const selected = value ? parseISO(value) : null;
  const today = new Date();

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<ViewMode>("day");
  // The month/year the grid is currently focused on (not the selection).
  const [cursor, setCursor] = useState(() => selected ?? today);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  const toggle = () => {
    if (open) {
      setOpen(false);
      return;
    }
    // Re-sync the grid to the current selection; placement happens once the popover
    // mounts (via the ref callback), so it can measure its real size.
    setCursor(selected ?? today);
    setMode("day");
    setPos(null);
    setOpen(true);
  };

  // Measure the trigger + the mounted popover and pin the popover just below the
  // trigger, flipping above and clamping to the viewport when there isn't room.
  const place = useCallback(() => {
    const t = triggerRef.current;
    const p = popRef.current;
    if (!t) return;
    const r = t.getBoundingClientRect();
    const pw = p?.offsetWidth ?? 264;
    const ph = p?.offsetHeight ?? 320;
    // Layout viewport — more reliable than innerWidth/Height (which can read 0 in a
    // headless/hidden pane), falling back to a sane default.
    const doc = document.documentElement;
    const vw = doc.clientWidth || window.innerWidth || pw + 16;
    const vh = doc.clientHeight || window.innerHeight || ph + 16;
    const below = r.bottom + 8 + ph <= vh;
    const top = below ? r.bottom + 8 : Math.max(8, r.top - 8 - ph);
    const left = Math.min(Math.max(8, r.left), Math.max(8, vw - pw - 8));
    setPos({ left, top });
  }, []);

  // Position on mount (real dimensions known) and keep the ref in sync.
  const setPopRef = useCallback(
    (node: HTMLDivElement | null) => {
      popRef.current = node;
      if (node) place();
    },
    [place],
  );

  // Close on outside click, Escape; reposition while open on scroll/resize.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (popRef.current?.contains(t) || triggerRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onReflow = () => place();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onReflow);
    window.addEventListener("scroll", onReflow, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onReflow);
      window.removeEventListener("scroll", onReflow, true);
    };
  }, [open, place]);

  const commit = (d: Date) => {
    onChange(toISO(d));
    setOpen(false);
  };

  const label = selected
    ? selected.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : placeholder;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        data-placeholder={!selected}
        className={triggerClass}
      >
        {label}
      </button>

      {open && typeof document !== "undefined" &&
        createPortal(
          <div
            ref={setPopRef}
            style={{
              position: "fixed",
              // Inline z-index (not a Tailwind class) so it can never be purged and
              // drop behind the z-50 editor modals — the picker portals to <body>,
              // above every modal.
              zIndex: 1000,
              left: pos?.left ?? 0,
              top: pos?.top ?? 0,
              width: 264,
              visibility: pos ? "visible" : "hidden",
            }}
            className="rounded-2xl border border-border bg-surface-2 p-3 shadow-xl"
            role="dialog"
            aria-label="Choose a date"
          >
            <Header mode={mode} cursor={cursor} onStep={(dir) => step(dir)} onZoomOut={zoomOut} />
            {mode === "day" && (
              <DayGrid
                cursor={cursor}
                selected={selected}
                today={today}
                onPick={commit}
              />
            )}
            {mode === "month" && (
              <MonthGrid
                cursor={cursor}
                selected={selected}
                onPick={(m) => {
                  setCursor(new Date(cursor.getFullYear(), m, 1));
                  setMode("day");
                }}
              />
            )}
            {mode === "year" && (
              <YearGrid
                cursor={cursor}
                selected={selected}
                onPick={(y) => {
                  setCursor(new Date(y, cursor.getMonth(), 1));
                  setMode("month");
                }}
              />
            )}
            <div className="mt-2 flex justify-between border-t border-border pt-2">
              <button
                type="button"
                onClick={() => commit(today)}
                className="rounded-md px-2 py-1 text-xs text-emerald transition-colors hover:bg-surface"
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md px-2 py-1 text-xs text-muted transition-colors hover:bg-surface hover:text-foreground"
              >
                Close
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  );

  function zoomOut() {
    setMode((m) => (m === "day" ? "month" : "year"));
  }

  function step(dir: 1 | -1) {
    setCursor((c) => {
      if (mode === "day") return new Date(c.getFullYear(), c.getMonth() + dir, 1);
      if (mode === "month") return new Date(c.getFullYear() + dir, c.getMonth(), 1);
      return new Date(c.getFullYear() + dir * 12, c.getMonth(), 1); // year block
    });
  }
}

/** The prev/title/next row. The title climbs a zoom level when clicked. */
function Header({
  mode,
  cursor,
  onStep,
  onZoomOut,
}: {
  mode: ViewMode;
  cursor: Date;
  onStep: (dir: 1 | -1) => void;
  onZoomOut: () => void;
}) {
  const title =
    mode === "day"
      ? `${MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`
      : mode === "month"
        ? `${cursor.getFullYear()}`
        : (() => {
            const s = yearBlockStart(cursor.getFullYear());
            return `${s} – ${s + 11}`;
          })();

  return (
    <div className="mb-2 flex items-center justify-between">
      <ArrowBtn dir={-1} onClick={() => onStep(-1)} />
      <button
        type="button"
        onClick={mode === "year" ? undefined : onZoomOut}
        disabled={mode === "year"}
        className="rounded-md px-2 py-1 text-sm font-semibold text-foreground transition-colors hover:bg-surface disabled:cursor-default disabled:hover:bg-transparent"
      >
        {title}
      </button>
      <ArrowBtn dir={1} onClick={() => onStep(1)} />
    </div>
  );
}

function ArrowBtn({ dir, onClick }: { dir: 1 | -1; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={dir === 1 ? "Next" : "Previous"}
      className="rounded-md p-1.5 text-muted transition-colors hover:bg-surface hover:text-foreground"
    >
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d={dir === 1 ? "m9 18 6-6-6-6" : "m15 18-6-6 6-6"} />
      </svg>
    </button>
  );
}

function DayGrid({
  cursor,
  selected,
  today,
  onPick,
}: {
  cursor: Date;
  selected: Date | null;
  today: Date;
  onPick: (d: Date) => void;
}) {
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const first = new Date(year, month, 1);
  const lead = mondayIndex(first);
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // 6 weeks × 7 days, offset so day 1 lands on its weekday.
  const cells: (Date | null)[] = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div>
      <div className="grid grid-cols-7 gap-0.5">
        {WEEKDAYS.map((w) => (
          <div key={w} className="py-1 text-center text-[10px] font-medium uppercase text-muted">
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((d, i) =>
          d === null ? (
            <div key={i} />
          ) : (
            <button
              key={i}
              type="button"
              onClick={() => onPick(d)}
              className={cellClass(
                selected != null && sameDay(d, selected),
                sameDay(d, today),
              )}
            >
              {d.getDate()}
            </button>
          ),
        )}
      </div>
    </div>
  );
}

function MonthGrid({
  cursor,
  selected,
  onPick,
}: {
  cursor: Date;
  selected: Date | null;
  onPick: (month: number) => void;
}) {
  const now = new Date();
  return (
    <div className="grid grid-cols-3 gap-1">
      {MONTHS.map((m, i) => (
        <button
          key={m}
          type="button"
          onClick={() => onPick(i)}
          className={cellClass(
            selected != null && selected.getFullYear() === cursor.getFullYear() && selected.getMonth() === i,
            now.getFullYear() === cursor.getFullYear() && now.getMonth() === i,
            "py-2",
          )}
        >
          {m}
        </button>
      ))}
    </div>
  );
}

function YearGrid({
  cursor,
  selected,
  onPick,
}: {
  cursor: Date;
  selected: Date | null;
  onPick: (year: number) => void;
}) {
  const start = yearBlockStart(cursor.getFullYear());
  const years = Array.from({ length: 12 }, (_, i) => start + i);
  const now = new Date().getFullYear();
  return (
    <div className="grid grid-cols-3 gap-1">
      {years.map((y) => (
        <button
          key={y}
          type="button"
          onClick={() => onPick(y)}
          className={cellClass(selected?.getFullYear() === y, now === y, "py-2")}
        >
          {y}
        </button>
      ))}
    </div>
  );
}

/** Shared cell styling: selected wins, else today gets a ring, else plain. */
function cellClass(isSelected: boolean, isToday: boolean, extra = "") {
  const base = `rounded-md text-sm transition-colors ${extra || "aspect-square"}`;
  if (isSelected) return `${base} bg-emerald font-semibold text-background`;
  if (isToday) return `${base} text-emerald ring-1 ring-inset ring-emerald/40 hover:bg-surface`;
  return `${base} text-foreground hover:bg-surface`;
}
