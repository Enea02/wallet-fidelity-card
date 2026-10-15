"use client";

import { useActionState, useState, type ReactNode } from "react";
import type { ActionResult } from "@/lib/support/run";

export type FormAction = (prev: ActionResult<unknown> | null, form: FormData) => Promise<ActionResult<unknown>>;

/**
 * Modulo di un'azione del pannello: pulsante con attesa, esito sotto il pulsante.
 * Gli errori mostrano il messaggio del catalogo e il codice assistenza (per cercarlo nella vista Assistenza).
 * `confirm`: testo della conferma prima dell'invio (azioni che cambiano dati).
 */
export function ActionForm({
  action,
  submit,
  children,
  danger = false,
  confirm,
  testId,
}: {
  action: FormAction;
  submit: string;
  children?: ReactNode;
  danger?: boolean;
  confirm?: string;
  testId?: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const [armed, setArmed] = useState(false);
  const needsConfirm = confirm !== undefined && !armed;
  return (
    <form action={formAction} className="int-form" data-testid={testId}>
      {children}
      {needsConfirm ? (
        <button type="button" className={danger ? "int-btn int-danger" : "int-btn"} onClick={() => setArmed(true)}>
          {submit}
        </button>
      ) : (
        <div className="int-row">
          {confirm !== undefined && <span className="int-confirm">{confirm}</span>}
          <button
            type="submit"
            className={danger ? "int-btn int-danger" : "int-btn"}
            disabled={pending}
            data-testid={testId ? `${testId}-invia` : undefined}
          >
            {pending ? "Attendere…" : confirm !== undefined ? "Conferma" : submit}
          </button>
          {confirm !== undefined && (
            <button type="button" className="int-btn int-ghost" onClick={() => setArmed(false)}>
              Annulla
            </button>
          )}
        </div>
      )}
      {state && !state.ok && (
        <p className="int-notice int-notice-error" role="alert">
          {state.message} <span className="int-code">{state.supportCode}</span>
        </p>
      )}
      {state?.ok && state.message && (
        <p className="int-notice int-notice-ok" role="status">
          {state.message}
        </p>
      )}
    </form>
  );
}
