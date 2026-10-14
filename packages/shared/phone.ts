/*
 * Telefono del cliente: normalizzazione E.164 (+39 di default) e regole di iscrizione.
 * Solo cellulari italiani (+39 3…), come da brief ("invio solo verso l'Italia").
 * Stessa funzione nel form (validazione alla perdita di focus, come da design) e nel server.
 */

export type PhoneCheck =
  | { ok: true; e164: string; display: string }
  | { ok: false; reason: "incompleto" | "troppo_lungo" | "non_cellulare" | "estero" | "vuoto"; message: string };

const MESSAGES: Record<Exclude<PhoneCheck, { ok: true }>["reason"], string> = {
  vuoto: "Inserisci il numero di cellulare.",
  incompleto: "Numero incompleto: servono 9 o 10 cifre.",
  troppo_lungo: "Numero troppo lungo: servono 9 o 10 cifre.",
  non_cellulare: "Serve un numero di cellulare: inizia con 3.",
  estero: "Per ora la carta è disponibile solo con un numero italiano (+39).",
};

const fail = (reason: Exclude<PhoneCheck, { ok: true }>["reason"]): PhoneCheck => ({
  ok: false,
  reason,
  message: MESSAGES[reason],
});

/** "+393331234567" → "+39 333 123 4567" */
export function formatItalianMobile(e164: string): string {
  const n = e164.replace(/^\+39/, "");
  return `+39 ${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}`.trim();
}

/**
 * @param input numero come scritto dal cliente (spazi, punti, trattini ammessi; anche con +39 o 0039)
 * @param prefix prefisso del campo separato (default +39)
 */
export function checkItalianMobile(input: string, prefix = "+39"): PhoneCheck {
  const raw = input.replace(/[\s().-]/g, "");
  if (!raw) return fail("vuoto");
  let p = prefix.replace(/\s/g, "");
  let digits = raw;
  if (digits.startsWith("+")) {
    p = "+";
    digits = digits.slice(1);
  } else if (digits.startsWith("00")) {
    p = "+";
    digits = digits.slice(2);
  }
  if (p === "+") {
    if (!digits.startsWith("39")) return fail("estero");
    digits = digits.slice(2);
  } else if (p !== "+39" && p !== "39") {
    return fail("estero");
  }
  if (!/^\d+$/.test(digits)) return fail("incompleto");
  if (!digits.startsWith("3")) return fail("non_cellulare");
  if (digits.length < 9) return fail("incompleto");
  if (digits.length > 10) return fail("troppo_lungo");
  const e164 = `+39${digits}`;
  return { ok: true, e164, display: formatItalianMobile(e164) };
}
