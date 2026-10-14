"use client";

import { useState } from "react";
import { PublicApiError, publicPost } from "../../_components/public-api";
import { SupportCode } from "../../_components/SupportCode";

/** Conferma con un pulsante: le anteprime dei link nelle chat non disiscrivono nessuno. */
export function UnsubscribeConfirm({ token, shopName }: { token: string; shopName: string }) {
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [problem, setProblem] = useState<{ message: string; supportCode: string } | null>(null);

  if (state === "done") {
    return (
      <p className="lw-lead" role="status">
        Fatto: non riceverai più promozioni da <strong>{shopName}</strong>. La tua carta resta attiva con tutti i
        timbri.
      </p>
    );
  }
  return (
    <>
      <p className="lw-lead">
        Non riceverai più offerte e novità da <strong>{shopName}</strong> sulla carta fedeltà. La carta resta attiva con
        tutti i timbri.
      </p>
      {problem && (
        <div className="lw-alert" role="alert">
          <span className="icon" aria-hidden="true">
            !
          </span>
          <div>
            <div>{problem.message}</div>
            {problem.supportCode && <SupportCode code={problem.supportCode} />}
          </div>
        </div>
      )}
      <button
        type="button"
        className="lw-btn"
        disabled={state === "busy"}
        onClick={async () => {
          setState("busy");
          setProblem(null);
          try {
            await publicPost("/api/public/unsubscribe", { token });
            setState("done");
          } catch (e) {
            setProblem(
              e instanceof PublicApiError
                ? { message: e.message, supportCode: e.supportCode }
                : { message: "Si è verificato un errore. Riprova.", supportCode: "" },
            );
            setState("idle");
          }
        }}
      >
        {state === "busy" ? "Un momento…" : "Non voglio più promozioni"}
      </button>
    </>
  );
}
