import { describe, expect, it } from "vitest";
import {
  axisMax,
  deltaPercent,
  describeIssue,
  duration,
  filterShops,
  initials,
  parseShopQuery,
  programBadges,
  shopState,
  sparkPoints,
  when,
  type ShopCard,
} from "./overview-view";

const NOW = new Date("2026-11-03T10:42:00Z"); // 11:42 a Roma
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
const H = 3_600_000;
const D = 24 * H;

const shop = (o: Partial<ShopCard> = {}): ShopCard => ({
  id: o.slug ?? "x",
  slug: "barberia-rossi",
  name: "Barberia Rossi",
  status: "active",
  created_at: "2026-10-01T10:00:00Z",
  hex_color: "#1F4E79",
  loyalty_enabled: true,
  loyalty_mode: "timbri",
  stamps_required: 10,
  reward_label: "Taglio gratis",
  points_per_euro: 1,
  levels: 0,
  prepaid_kinds: [],
  customers: 10,
  customers_new_7: 1,
  activity_7: 5,
  staff: 2,
  owner: "Luca",
  owner_email: "luca@barberia.test",
  vat_number: "IT01234567890",
  spark: [],
  issues: [],
  ...o,
});

describe("numeri e durate", () => {
  it.each([
    [30_000, "meno di un minuto"],
    [35 * 60_000, "35 min"],
    [2 * H, "2 h"],
    [47 * H, "47 h"],
    [5 * D, "5 giorni"],
  ])("durata %i ms → %s", (ms, text) => expect(duration(ms)).toBe(text));

  it("variazione sul periodo prima, null senza base", () => {
    expect(deltaPercent(108, 100)).toBe("+8%");
    expect(deltaPercent(90, 100)).toBe("-10%");
    expect(deltaPercent(5, 0)).toBeNull();
  });

  it("iniziali dei monogrammi", () => {
    expect(initials("Barberia Rossi")).toBe("BR");
    expect(initials("Caffè  Centrale!")).toBe("CC");
    expect(initials("Enea")).toBe("EN");
    expect(initials("  ")).toBe("?");
  });

  it("quando: oggi solo l'ora, ieri, poi giorno e ora (ora italiana)", () => {
    expect(when("2026-11-03T09:31:00Z", NOW)).toBe("10:31");
    expect(when("2026-11-02T17:40:00Z", NOW)).toBe("ieri 18:40");
    expect(when("2026-10-28T08:12:00Z", NOW)).toMatch(/^28 ott 09:12$/);
  });

  it("asse del grafico arrotondato e linea della card dentro il riquadro", () => {
    expect(axisMax([0, 0])).toBe(3);
    expect(axisMax([712])).toBe(750);
    expect(axisMax([31])).toBe(60);
    const pts = sparkPoints([0, 5, 10])
      .split(" ")
      .map((p) => p.split(",").map(Number));
    expect(pts[0]).toEqual([0, 31]);
    expect(pts[2]).toEqual([140, 3]);
  });
});

describe("cose da guardare", () => {
  it("carte non sincronizzate: frase completa e riquadro della card", () => {
    const v = describeIssue(
      { kind: "sync", since: ago(2 * H), detail: { cards: 3, error_code: "E_GOOGLE_API", exhausted: 0 } },
      NOW,
    );
    expect(v).toMatchObject({
      tone: "err",
      label: "errore",
      text: "3 carte non sincronizzate con Google Wallet da 2 h · E_GOOGLE_API",
      band: "3 carte non sincronizzate con Google",
    });
  });

  it("solo il template non aggiornato, ritentativi esauriti", () => {
    const v = describeIssue({ kind: "sync", since: ago(D), detail: { cards: 0, templates: 1, exhausted: 1 } }, NOW);
    expect(v.text).toBe("Template del negozio non aggiornato su Google Wallet da 24 h · ritentativi esauriti");
  });

  it("ticket, invito, inattività, diagnostica e sospensione", () => {
    expect(
      describeIssue(
        {
          kind: "ticket",
          since: ago(35 * 60_000),
          detail: { ticket: "DIAG-4F2K9", platform: "ios", app_version: "1.8.2", lines: 214, total: 1 },
        },
        NOW,
      ),
    ).toMatchObject({
      tone: "warn",
      text: "Pacchetto diagnostica DIAG-4F2K9 ricevuto 35 min fa · ios 1.8.2 · 214 righe",
      band: "Nuovo ticket DIAG-4F2K9",
    });
    expect(describeIssue({ kind: "invito", since: ago(5 * D), detail: {} }, NOW).text).toBe(
      "Invito del titolare in attesa da 5 giorni: il negozio non è ancora operativo",
    );
    expect(describeIssue({ kind: "inattivo", since: null, detail: { last_at: ago(16 * D) } }, NOW).text).toBe(
      "Nessuna iscrizione e nessuna attività da 16 giorni",
    );
    expect(describeIssue({ kind: "inattivo", since: null, detail: { last_at: null } }, NOW).text).toBe(
      "Nessuna iscrizione e nessuna attività da quando è stato creato",
    );
    expect(
      describeIssue(
        {
          kind: "diagnostica",
          since: ago(H),
          detail: { level: "debug", enabled_by: "Marco", expires_at: new Date(NOW.getTime() + 3 * H).toISOString() },
        },
        NOW,
      ).text,
    ).toBe("Modalità diagnostica «debug» attiva · scade tra 3 h · attivata da Marco");
    expect(
      describeIssue(
        { kind: "sospeso", since: "2026-10-12T09:00:00Z", detail: { reason: "abbonamento non rinnovato" } },
        NOW,
      ).text,
    ).toBe("Sospeso il 12 ott · «abbonamento non rinnovato»");
  });
});

describe("card dei negozi", () => {
  it("etichette del programma", () => {
    expect(programBadges(shop())).toEqual(["Timbri · 10 → Taglio gratis"]);
    expect(programBadges(shop({ loyalty_mode: "punti", levels: 3, prepaid_kinds: ["consumo"] }))).toEqual([
      "Punti · 1 pt ogni €",
      "3 livelli",
      "Tessera prepagata",
    ]);
    expect(programBadges(shop({ loyalty_enabled: false, prepaid_kinds: ["abbonamento"] }))).toEqual([
      "Solo abbonamenti",
    ]);
  });

  it("stato: sospeso, da avviare (titolare mai entrato), attivo", () => {
    expect(shopState(shop({ status: "suspended" }))).toBe("sospeso");
    expect(shopState(shop({ issues: [{ kind: "invito", since: null, detail: {} }] }))).toBe("da avviare");
    expect(shopState(shop())).toBe("attivo");
  });

  it("filtri e ordinamento: problemi prima, conteggi dei chip sulla ricerca", () => {
    const list = [
      shop({ id: "a", slug: "a", name: "Zeta", activity_7: 50 }),
      shop({ id: "b", slug: "forno-beta", name: "Beta", issues: [{ kind: "ticket", since: null, detail: {} }] }),
      shop({ id: "c", slug: "c", name: "Alfa", issues: [{ kind: "sync", since: null, detail: {} }] }),
      shop({ id: "d", slug: "d", name: "Delta", status: "suspended", owner_email: "anna@forno.test" }),
    ];
    const all = filterShops(list, parseShopQuery({}));
    expect(all.shops.map((s) => s.id)).toEqual(["c", "b", "a", "d"]);
    expect(all.counts).toMatchObject({ tutti: 4, problemi: 2, attivi: 3, sospesi: 1 });

    expect(filterShops(list, parseShopQuery({ stato: "problemi", ordina: "nome" })).shops.map((s) => s.id)).toEqual([
      "c",
      "b",
    ]);
    const byEmail = filterShops(list, parseShopQuery({ q: "ANNA@forno" }));
    expect(byEmail.shops.map((s) => s.id)).toEqual(["d"]);
    expect(byEmail.counts.tutti).toBe(1);
    expect(filterShops(list, parseShopQuery({ q: "/forno-beta" })).shops.map((s) => s.id)).toEqual(["b"]);
    expect(parseShopQuery({ stato: "boh", ordina: "x" })).toMatchObject({ stato: "tutti", ordina: "problemi" });
  });
});
