import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import { useClickOutside } from "../../hooks/useClickOutside";

interface PopoverProps {
  trigger: (open: boolean) => ReactNode;
  children: ReactNode | ((close: () => void) => ReactNode);
  align?: "left" | "right";
  widthClass?: string;
  wrapperClassName?: string;
  // Sizes the content to match the trigger's own rendered width (e.g. a picker meant to look like
  // a dropdown attached to its field) instead of a fixed Tailwind width — set the actual pixel width
  // inline, since a portaled, fixed-position element can't lean on a CSS % width the way an
  // absolutely-positioned child of its own trigger could.
  matchTriggerWidth?: boolean;
  // Lets content that overflows this popover's own box (e.g. a nested Select/DateTimePicker's
  // absolutely-positioned menu) stay visible instead of being clipped at this box's edge. Only safe
  // to opt into for popovers with short, non-scrolling content of their own — it also drops the
  // max-h-[80vh] clamp, so a popover that genuinely needs to scroll its own content should not use it.
  allowOverflow?: boolean;
}

export function Popover({
  trigger,
  children,
  align = "left",
  widthClass = "w-64",
  wrapperClassName,
  matchTriggerWidth,
  allowOverflow,
}: PopoverProps) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{
    top: number;
    left: number;
    width: number | null;
  } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  // Trigger and content are two separate DOM subtrees now that content is portaled to <body> — a
  // click inside the content (typing in a field, clicking a spinner arrow) is nowhere inside `ref`
  // anymore, so checking only that ref would treat every interaction with the popover's own content
  // as an "outside" click and close it instantly. Both refs count as inside.
  useClickOutside([ref, contentRef], () => setOpen(false), open);

  // Portaled straight to <body> with fixed coordinates computed from the trigger's real on-screen
  // position, instead of a plain CSS-absolute child of the trigger — this is very often used inside
  // a scrolling container (a table body, a modal list, a dropdown list), and an absolutely-positioned
  // child gets silently clipped the moment it needs to extend outside that container's own bounds.
  //
  // Anchored below the trigger by default, but that's a starting preference, not a rule it has to
  // stay attached to — showing the whole thing always wins over staying pinned to any one spot.
  // There often isn't scrollable slack to rely on instead (a short table with nothing below the
  // trigger has nowhere else for the extra height to go), so it slides up however far it needs to —
  // even ending up entirely above the trigger for a tall box near the bottom of the screen — as long
  // as the result is fully visible with nothing cut off.
  useLayoutEffect(() => {
    if (!open || !ref.current || !contentRef.current) return;

    const recompute = () => {
      if (!ref.current || !contentRef.current) return;
      const triggerRect = ref.current.getBoundingClientRect();
      const contentWidth = contentRef.current.offsetWidth;
      const contentHeight = contentRef.current.offsetHeight;
      const top = Math.max(
        8,
        Math.min(
          triggerRect.bottom + 8,
          window.innerHeight - contentHeight - 8,
        ),
      );
      const left =
        align === "right" ? triggerRect.right - contentWidth : triggerRect.left;
      setCoords({
        top,
        left,
        width: matchTriggerWidth ? triggerRect.width : null,
      });
    };

    recompute();
    // A resize observer alone only catches the content changing size in place — scrolling (the
    // window, or a nested overflow-y-auto container) doesn't resize anything, so it needs its own
    // listener. Capture: true so it fires for scroll events on ANY ancestor, not just window, since
    // scroll doesn't bubble.
    const resizeObserver = new ResizeObserver(recompute);
    resizeObserver.observe(contentRef.current);
    window.addEventListener("scroll", recompute, true);
    window.addEventListener("resize", recompute);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("scroll", recompute, true);
      window.removeEventListener("resize", recompute);
    };
  }, [open, align, matchTriggerWidth]);

  return (
    <div className={clsx("relative", wrapperClassName)} ref={ref}>
      <div onClick={() => setOpen((o) => !o)}>{trigger(open)}</div>
      {open &&
        createPortal(
          <div
            ref={contentRef}
            style={
              coords
                ? {
                    top: coords.top,
                    left: coords.left,
                    width: coords.width ?? undefined,
                  }
                : { top: 0, left: -9999 }
            }
            className={clsx(
              "fixed z-[100] rounded-lg border border-slate-200 bg-white shadow-lg shadow-slate-900/5",
              allowOverflow
                ? "overflow-visible"
                : "max-h-[80vh] overflow-y-auto",
              !matchTriggerWidth && widthClass,
            )}
          >
            {typeof children === "function"
              ? children(() => setOpen(false))
              : children}
          </div>,
          document.body,
        )}
    </div>
  );
}
