// A large modal for Structure & BOM's detail editors (legs, mounting system,
// site loads). Those editors were squeezed into a 340 px card floating over the
// 3D; here they get room. Dark chrome, because the editors inside are drawn for
// the canvas token set (DESIGN-SYSTEM §4.2: chrome over the canvas is dark).
import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { useEscape, useFocusTrap } from '../../components/ui';

export function StepDialog({
  title,
  subtitle,
  onClose,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEscape(onClose);
  const trapRef = useFocusTrap(true);
  return (
    <div
      className="ds fixed inset-0 z-50 flex items-center justify-center bg-surface-overlay p-6"
      onClick={onClose}
    >
      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-full w-full max-w-3xl flex-col overflow-hidden rounded-lg bg-surface-canvas-panel text-on-canvas shadow-3"
      >
        <header className="flex items-start gap-3 border-b border-border-canvas px-6 py-4">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h2 className="text-lg font-semibold">{title}</h2>
            {subtitle && <p className="text-xs text-on-canvas-muted">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex size-8 items-center justify-center rounded-md border border-border-canvas-strong hover:bg-surface-canvas"
          >
            <X size={16} aria-hidden />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">{children}</div>
        {footer && (
          <footer className="flex items-center gap-3 border-t border-border-canvas px-6 py-3">{footer}</footer>
        )}
      </div>
    </div>
  );
}
