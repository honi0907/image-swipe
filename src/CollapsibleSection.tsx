import { useCallback, useId, useState } from "react";

type Props = {
  storageId: string;
  title: React.ReactNode;
  defaultOpen?: boolean;
  headerExtra?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
};

function readStoredOpen(storageId: string, defaultOpen: boolean): boolean {
  try {
    const v = localStorage.getItem(`swipe-collapse:${storageId}`);
    if (v === "0") {
      return false;
    }
    if (v === "1") {
      return true;
    }
  } catch {
    /* ignore */
  }
  return defaultOpen;
}

export function CollapsibleSection({
  storageId,
  title,
  defaultOpen = true,
  headerExtra,
  className,
  children,
}: Props) {
  const [open, setOpen] = useState(() => readStoredOpen(storageId, defaultOpen));
  const panelId = useId();

  const toggle = useCallback(() => {
    setOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(`swipe-collapse:${storageId}`, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, [storageId]);

  return (
    <section
      className={`collapsible-section${open ? "" : " is-collapsed"}${className ? ` ${className}` : ""}`}
    >
      <header className="collapsible-head">
        <button
          type="button"
          className="collapsible-toggle"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={toggle}
        >
          <span className="collapsible-chevron" aria-hidden />
          <span className="collapsible-title">{title}</span>
        </button>
        {headerExtra ? <div className="collapsible-extra">{headerExtra}</div> : null}
      </header>
      {open ? (
        <div id={panelId} className="collapsible-body">
          {children}
        </div>
      ) : null}
    </section>
  );
}
