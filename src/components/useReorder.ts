"use client";

import { useLayoutEffect, useRef, useState } from "react";

/**
 * Drag-to-reorder for a grid of cards, dependency-free (native HTML5 DnD) but with
 * the live "sortable" feel: while you drag, the list is shown in a **preview order**
 * with the dragged item slotted where the cursor is, and the other cards **slide**
 * into place via a FLIP animation — so the result is visible mid-drag, not only on
 * drop. The caller renders `orderedItems` (not its own array) and persists the final
 * order through `onReorder`; here that flows up to the debounced save like any edit.
 *
 * Dragging is initiated from a dedicated grip handle (`handleProps`) so it never
 * competes with a card's click/keyboard handlers; the whole card is a drop target
 * and an animation node (`itemProps`). The handle also takes arrow keys, so the list
 * reorders without a mouse.
 */
export function useReorder<T>(
  items: T[],
  keyOf: (item: T) => string,
  onReorder: (next: T[]) => void,
) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const indexOf = (arr: T[], id: string) => arr.findIndex((i) => keyOf(i) === id);

  const withMoved = (arr: T[], fromId: string, toIdx: number) => {
    const from = indexOf(arr, fromId);
    if (from < 0 || toIdx < 0 || toIdx >= arr.length || from === toIdx) return arr;
    const next = arr.slice();
    const [moved] = next.splice(from, 1);
    next.splice(toIdx, 0, moved);
    return next;
  };

  // What to render: mid-drag, the dragged item previewed at the hovered slot.
  let orderedItems = items;
  if (dragId && overId && dragId !== overId) {
    orderedItems = withMoved(items, dragId, indexOf(items, overId));
  }

  /* ----- FLIP: animate cards sliding to their new slots -----
   * Positions are read with offsetLeft/offsetTop (layout coords, unaffected by any
   * in-flight transform) rather than getBoundingClientRect — so overlapping drags
   * don't measure a mid-animation position and jump. Each move is a Web Animations
   * API tween: self-cleaning, and restartable in place when a new reorder lands
   * before the previous glide finishes. */
  const nodes = useRef(new Map<string, HTMLElement>());
  const prevPos = useRef(new Map<string, { left: number; top: number }>());
  const anims = useRef(new Map<string, Animation>());
  useLayoutEffect(() => {
    nodes.current.forEach((el, id) => {
      const left = el.offsetLeft;
      const top = el.offsetTop;
      const prev = prevPos.current.get(id);
      if (prev) {
        const dx = prev.left - left;
        const dy = prev.top - top;
        if (dx || dy) {
          anims.current.get(id)?.cancel();
          const anim = el.animate(
            [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "translate(0, 0)" }],
            { duration: 220, easing: "cubic-bezier(0.2, 0, 0, 1)" },
          );
          anims.current.set(id, anim);
        }
      }
      prevPos.current.set(id, { left, top });
    });
  });
  const registerNode = (id: string) => (el: HTMLElement | null) => {
    if (el) nodes.current.set(id, el);
    else {
      nodes.current.delete(id);
      prevPos.current.delete(id);
      anims.current.delete(id);
    }
  };

  function moveBy(id: string, delta: number) {
    const next = withMoved(items, id, indexOf(items, id) + delta);
    if (next !== items) onReorder(next);
  }

  /** Props for the grip handle — the only element that initiates a drag. */
  const handleProps = (id: string) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      // Carry a snapshot of the whole card, not the tiny grip glyph, so it reads
      // as picking the card up. Grab offset kept near the grip.
      const card = nodes.current.get(id);
      if (card) e.dataTransfer.setDragImage(card, 24, 24);
      setDragId(id);
      setOverId(id);
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", id);
    },
    onDragEnd: () => {
      setDragId(null);
      setOverId(null);
    },
    onClick: (e: React.MouseEvent) => e.stopPropagation(),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
        e.preventDefault();
        moveBy(id, -1);
      } else if (e.key === "ArrowDown" || e.key === "ArrowRight") {
        e.preventDefault();
        moveBy(id, 1);
      }
    },
  });

  /** Props for a card — a FLIP node and a drop target. */
  const itemProps = (id: string) => ({
    ref: registerNode(id),
    onDragOver: (e: React.DragEvent) => {
      if (!dragId) return;
      // Accept the drop over ANY card while dragging — including the moving card's
      // own placeholder, which sits under the cursor once the list reflows. Without
      // this the release often lands on the placeholder and the drop is rejected.
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (dragId !== id && overId !== id) setOverId(id);
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      if (orderedItems !== items) onReorder(orderedItems); // commit the previewed order
      setDragId(null);
      setOverId(null);
    },
  });

  return { orderedItems, handleProps, itemProps, dragId, overId };
}

/**
 * Grip styling for the drag handle. Rendered as a focusable button so keyboard
 * users can move the card with arrow keys; spread `useReorder().handleProps(id)`
 * onto it. Quiet until the card is hovered/focused so it doesn't crowd the layout.
 */
export const DRAG_HANDLE_CLASS =
  "shrink-0 cursor-grab touch-none rounded-md px-1 text-lg leading-none text-muted/50 " +
  "transition-colors hover:text-foreground focus-visible:text-foreground " +
  "focus-visible:outline-none active:cursor-grabbing";
