"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, startTransition } from "react";
import { emptyState, type FormState } from "@/app/form-state";
import { ErrorSummary } from "./Fields";
import { FlagList, UrgentNotice } from "./Flags";

/**
 * Wraps a server action in a form that shows validation errors and today's result.
 * Submits via JS so typed values are kept when validation fails.
 */
export function ActionForm({
  action,
  submitLabel,
  children,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  submitLabel: string;
  children: React.ReactNode;
}) {
  const [state, run, pending] = useActionState(action, emptyState);
  const summaryRef = useRef<HTMLDivElement>(null);
  const hasErrors = Object.keys(state.errors).length > 0;

  useEffect(() => {
    if (hasErrors) summaryRef.current?.focus();
  }, [hasErrors, state]);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => run(fd));
      }}
      noValidate
    >
      <div ref={summaryRef} tabIndex={-1}>
        <ErrorSummary errors={state.errors} />
      </div>
      {children}
      <div className="btn-row">
        <button className="btn" type="submit" disabled={pending}>
          {pending ? "Saving..." : submitLabel}
        </button>
      </div>
      {state.flags && (
        <section aria-live="polite" style={{ marginTop: "1.5rem" }}>
          <h2>Result for {state.asOf}</h2>
          {state.replaced && <p className="muted small">This replaced your earlier check-in for today.</p>}
          {state.flags.some((f) => f.level === "urgent") && <UrgentNotice />}
          <FlagList flags={state.flags} />
          <p>
            <Link href="/athlete">Open my status</Link>
          </p>
        </section>
      )}
    </form>
  );
}
