"use client";

import { useState } from "react";

/** Codice assistenza copiabile con un tocco (brief: "codice assistenza breve… copiabile"). */
export function SupportCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="lw-support">
      Codice assistenza <strong>{code}</strong>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard?.writeText(code).then(() => setCopied(true));
        }}
      >
        {copied ? "Copiato" : "Copia"}
      </button>
    </span>
  );
}
