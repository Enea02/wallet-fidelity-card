import { AppError, errors, type ErrorCode } from "@loyalty/shared/errors";

/**
 * Converte gli errori sollevati dalle funzioni di dominio Postgres
 * (`raise exception 'E_…' using detail = '{json}'`) negli errori del catalogo,
 * con un messaggio tecnico per i log e, dove serve, uno più preciso per l'utente.
 * Gli altri errori del database tornano invariati (withApi li tratta come E_DB).
 */
interface PgError {
  code?: string;
  message: string;
  details?: string | null;
}

type Detail = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" || typeof v === "number" ? String(v) : "?");
const minutes = (v: unknown) => (Number(v) === 1 ? "1 minuto" : `${str(v)} minuti`);
const ago = (v: unknown) => (Number(v) < 1 ? "meno di un minuto fa" : `${minutes(v)} fa`);
const dayIt = (v: unknown) =>
  new Intl.DateTimeFormat("it-IT", {
    timeZone: "Europe/Rome",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(str(v))); // "21 ottobre alle ore 10:49"
const LATER_KIND: Record<string, string> = { redeem: "un riscatto", adjust: "una rettifica", stamp: "un altro timbro" };

const describe: Partial<Record<ErrorCode, (d: Detail) => { message: string; userMessage?: string }>> = {
  E_STAMP_COOLDOWN: (d) => ({
    message: `ultimo timbro ${ago(d.minutes_since)}, il negozio richiede almeno ${minutes(d.cooldown_min)} tra due timbri`,
    userMessage: `Ultimo timbro ${ago(d.minutes_since)}: si potrà timbrare di nuovo tra ${minutes(d.minutes_left)}.`,
  }),
  E_UNDO_EXPIRED: (d) => ({ message: `il timbro è stato dato ${minutes(d.minutes_ago)} fa (limite 5 minuti)` }),
  E_UNDO_OTHER_OPERATOR: (d) => ({
    message: `il timbro è stato dato da ${str(d.stamped_by)}`,
    userMessage: `Puoi annullare solo un timbro che hai dato tu: questo l'ha dato ${str(d.stamped_by)}.`,
  }),
  E_UNDO_NOT_LAST: (d) => ({
    message: `dopo il timbro sulla carta c'è stato ${LATER_KIND[str(d.later_kind)] ?? "un'altra operazione"}`,
  }),
  E_UNDO_REWARD_REDEEMED: () => ({ message: "il timbro ha sbloccato un premio che è già stato riscattato" }),
  E_NOTHING_TO_UNDO: () => ({ message: "la carta non ha timbri da annullare" }),
  E_NO_REWARD: (d) => ({ message: `la carta ${str(d.short_code)} non ha premi da riscattare` }),
  E_VALIDATION: (d) => ({
    message: `dati non validi, campo ${str(d.field)}: ${str(d.problem)}`,
    userMessage: `Dati non validi: ${str(d.problem)}.`,
  }),
  E_FORBIDDEN_ROLE: (d) => ({
    message: d.required
      ? `operazione riservata al titolare, l'utente è ${d.role === "operator" ? "operatore" : str(d.role)}`
      : str(d.reason),
  }),
  E_FORBIDDEN_SHOP: (d) => ({ message: `l'utente ${str(d.user_id)} non è abilitato sul negozio ${str(d.shop_id)}` }),
  E_CARD_DELETED: (d) => ({ message: `la carta ${str(d.short_code)} è stata cancellata il ${str(d.deleted_at)}` }),
  E_SHOP_SUSPENDED: (d) => ({ message: `il negozio ${str(d.shop_id)} è sospeso` }),
  E_LAST_OWNER: (d) => ({
    message: `${str(d.display_name)} è l'unico titolare del negozio: non può essere rimosso né declassato`,
  }),
  E_STAFF_NOT_FOUND: (d) => ({ message: `l'utente ${str(d.user_id)} non fa parte dello staff del negozio` }),
  E_STAFF_ALREADY_MEMBER: (d) => ({ message: `l'utente ${str(d.user_id)} fa già parte dello staff del negozio` }),
  E_PROMO_WEEKLY_LIMIT: (d) => ({
    message: `ultima promozione il ${str(d.last_at)}, la prossima è possibile dal ${str(d.next_allowed_at)}`,
    userMessage: `Puoi inviare una sola promozione a settimana: la prossima dal ${dayIt(d.next_allowed_at)}.`,
  }),
  E_PROMO_NO_RECIPIENTS: () => ({ message: "nessun cliente attivo con consenso marketing" }),
  E_PREPAID_NOT_ACTIVE: (d) => ({ message: `la tessera ${str(d.short_code)} non è ancora attiva` }),
  E_PREPAID_ALREADY_ACTIVE: (d) => ({
    message: `la tessera ${str(d.short_code)} è già attiva dal ${str(d.activated_at)}`,
  }),
  E_PREPAID_INSUFFICIENT: (d) => ({
    message: `richieste ${str(d.quantity)} ${str(d.unit_plural)} sulla tessera ${str(d.short_code)}, ne restano ${str(d.balance)}`,
    userMessage: `Sulla tessera restano solo ${str(d.balance)} ${str(d.unit_plural)}: scalane al massimo ${str(d.balance)} o ricaricala.`,
  }),
  E_PREPAID_EXPIRED: (d) => ({ message: `la tessera ${str(d.short_code)} è scaduta il ${str(d.expires_at)}` }),
  E_PREPAID_PRODUCT_NOT_FOUND: (d) => ({ message: `tipo di tessera ${str(d.product_id)} inesistente o disattivato` }),
  E_POINTS_AMOUNT_INVALID: (d) => ({ message: `importo di ${str(d.amount_cents)} centesimi non valido per i punti` }),
  E_POINTS_MODE_REQUIRED: (d) => ({ message: `il negozio ${str(d.shop_id)} usa la carta a timbri` }),
  E_STAMPS_MODE_REQUIRED: (d) => ({ message: `il negozio ${str(d.shop_id)} usa la carta a punti` }),
  E_MEMBERSHIP_NOT_RENEWABLE: (d) => ({
    message: `la membership ${str(d.short_code)} (${str(d.product)}) non ha scadenza`,
  }),
  E_SHOP_SLUG_TAKEN: (d) => ({ message: `lo slug ${str(d.slug)} non è disponibile (${str(d.reason)})` }),
  E_SUPPORT_FORBIDDEN: (d) => ({ message: str(d.reason) }),
};

const isCatalogCode = (s: string): s is ErrorCode => Object.hasOwn(errors, s);

export function fromDbError(e: PgError): AppError | PgError {
  if (e.code !== "P0001" || !isCatalogCode(e.message)) return e;
  let detail: Detail = {};
  try {
    detail = e.details ? (JSON.parse(e.details) as Detail) : {};
  } catch {
    // dettaglio non JSON: resta vuoto
  }
  const d = describe[e.message]?.(detail);
  return new AppError(e.message, d?.message ?? `${e.message} dal database`, detail, {
    ...(d?.userMessage !== undefined && { userMessage: d.userMessage }),
  });
}
