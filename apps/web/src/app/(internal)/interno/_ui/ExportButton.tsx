"use client";

import { useState } from "react";

/** Esportazione GDPR: scarica il JSON dei dati del cliente; errori con codice assistenza. */
export function ExportButton({ customerId }: { customerId: string }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  async function run() {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch(`/interno/clienti/${customerId}/esporta`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-platform": "interno" },
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) {
        const e = (await res.json().catch(() => null)) as { error?: { message: string; support_code: string } } | null;
        setResult({
          ok: false,
          text: `${e?.error?.message ?? "Esportazione non riuscita."} ${e?.error?.support_code ?? ""}`,
        });
        return;
      }
      const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "dati-cliente.json";
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
      setResult({ ok: true, text: `Scaricato ${name}: invialo all'interessato da un canale sicuro.` });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="int-form">
      <label>
        Motivo
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="richiesta di accesso via email del 03/11"
          data-testid="esporta-motivo"
        />
      </label>
      <div>
        <button type="button" className="int-btn" disabled={busy} onClick={() => void run()} data-testid="esporta">
          {busy ? "Attendere…" : "Esporta i dati (JSON)"}
        </button>
      </div>
      {result && (
        <p className={result.ok ? "int-notice int-notice-ok" : "int-notice int-notice-error"} role="status">
          {result.text}
        </p>
      )}
    </div>
  );
}
