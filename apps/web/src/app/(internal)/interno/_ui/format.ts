/** Date nel pannello: sempre in ora italiana (i log restano in UTC). */
const dt = new Intl.DateTimeFormat("it-IT", {
  timeZone: "Europe/Rome",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
const t = new Intl.DateTimeFormat("it-IT", {
  timeZone: "Europe/Rome",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});
const d = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", weekday: "long", day: "numeric", month: "long" });

export const dateTime = (iso: string | null | undefined) => (iso ? dt.format(new Date(iso)).replace(",", "") : "—");
export const time = (iso: string) => t.format(new Date(iso));
export const day = (iso: string) => d.format(new Date(iso));

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const formText = (f: FormData, k: string) => {
  const v = f.get(k);
  return typeof v === "string" ? v : "";
};
