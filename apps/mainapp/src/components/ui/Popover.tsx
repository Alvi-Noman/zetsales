import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { useClickOutside } from '../../hooks/useClickOutside';

interface PopoverProps {
  trigger: (open: boolean) => ReactNode;
  children: ReactNode | ((close: () => void) => ReactNode);
  align?: 'left' | 'right';
  widthClass?: string;
  wrapperClassName?: string;
}

export function Popover({ trigger, children, align = 'left', widthClass = 'w-64', wrapperClassName }: PopoverProps) {
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<'bottom' | 'top'>('bottom');
  const ref = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false), open);

  // Flip the dropdown above the trigger when there isn't enough room below (e.g. a drawer
  // footer pinned to the bottom of the screen) — otherwise the content just renders off-screen
  // with no way to scroll to it.
  useLayoutEffect(() => {
    if (!open || !ref.current) return;
    const triggerRect = ref.current.getBoundingClientRect();
    const contentHeight = contentRef.current?.offsetHeight ?? 0;
    const spaceBelow = window.innerHeight - triggerRect.bottom;
    const spaceAbove = triggerRect.top;
    setPlacement(spaceBelow < contentHeight && spaceAbove > spaceBelow ? 'top' : 'bottom');
  }, [open]);

  return (
    <div className={clsx('relative', wrapperClassName)} ref={ref}>
      <div onClick={() => setOpen((o) => !o)}>{trigger(open)}</div>
      {open && (
        <div
          ref={contentRef}
          className={clsx(
            'absolute z-30 max-h-[80vh] overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg shadow-slate-900/5',
            align === 'right' ? 'right-0' : 'left-0',
            placement === 'top' ? 'bottom-full mb-2' : 'top-full mt-2',
            widthClass
          )}
        >
          {typeof children === 'function' ? children(() => setOpen(false)) : children}
        </div>
      )}
    </div>
  );
}
