import { useEffect, type RefObject } from 'react';

// Accepts one ref or several — needed once a trigger's content is portaled elsewhere in the DOM
// (e.g. straight to <body>, to escape a scrolling ancestor's clipping): the trigger and its content
// are then two separate subtrees, so "outside" has to mean outside *both*, not just the trigger's
// own wrapper. A single ref keeps working exactly as before.
export function useClickOutside<T extends HTMLElement>(refs: RefObject<T | null> | RefObject<T | null>[], onOutside: () => void, active = true) {
  useEffect(() => {
    if (!active) return;
    const list = Array.isArray(refs) ? refs : [refs];
    function handler(e: MouseEvent) {
      const target = e.target as Node;
      const isInside = list.some((r) => r.current && r.current.contains(target));
      if (!isInside) onOutside();
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [refs, onOutside, active]);
}
