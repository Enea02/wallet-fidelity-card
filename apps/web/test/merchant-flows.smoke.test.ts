/**
 * Flussi delle API esercente sul Supabase locale (`pnpm db:start`), dalle route vere:
 * scansione, timbri, separazione tra negozi, clienti, impostazioni e logo, staff con
 * inviti (Mailpit), promozioni, diagnostica, cartello PDF, rate limit, CORS e validazione.
 */
import type { MerchantEndpoint } from "@loyalty/shared/api";
import type { LogLine } from "@loyalty/shared/logger";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { setLogSink } from "@/lib/observability/logger";
import {
  BARBIERE,
  GIULIA,
  SALONE,
  admin,
  call,
  cleanupCustomers,
  giulia,
  marco,
  newCustomer,
  testPhone,
} from "./support/merchant";

let G = "";
let M = "";
let lines: LogLine[] = [];
beforeAll(async () => {
  [G, M] = await Promise.all([giulia(), marco()]);
});
beforeEach(() => {
  lines = [];
  setLogSink((_t, l) => lines.push(l));
});
afterAll(cleanupCustomers);

const ev = (name: string) => lines.filter((l) => l.event === name);

describe("utente e negozi", () => {
  it("me e shops elencano i negozi con ruolo e nome", async () => {
    const r = await call("me", { token: M });
    expect(r.json).toMatchObject({
      user: { email: "operatore@salone-demo.test" },
      memberships: expect.arrayContaining([
        expect.objectContaining({ shopId: SALONE, role: "operator", displayName: "Marco" }),
        expect.objectContaining({ shopId: BARBIERE, role: "operator" }),
      ]),
    });
    const s = await call("shops", { token: G });
    expect((s.json?.shops as unknown[]).length).toBe(1);
  });
});

describe("scansione e timbri", () => {
  it("QR e codice breve trovano la carta; timbro, annullamento e riscatto per id", async () => {
    const c = await newCustomer(BARBIERE);
    const byQr = await call("lookup", { token: M, shopId: BARBIERE, body: { code: c.qr } });
    const byCode = await call("lookup", { token: M, shopId: BARBIERE, body: { code: c.shortCode.toLowerCase() } });
    expect(byQr.json).toEqual(byCode.json);
    expect(ev("customer.lookup.ok").map((l) => l.method)).toEqual(["QR", "codice breve"]);

    for (let i = 0; i < 10; i++) await call("stamp", { token: M, shopId: BARBIERE, body: { customerId: c.id } });
    const undone = await call("undo", { token: M, shopId: BARBIERE, body: { customerId: c.id } });
    expect(undone.json).toMatchObject({ card: { stamps: 9, rewardsAvailable: 0 } });
    const last = await call("stamp", { token: M, shopId: BARBIERE, body: { customerId: c.id } });
    expect(last.json).toMatchObject({ rewardUnlocked: true, card: { stamps: 0, rewardsAvailable: 1 } });
    const red = await call("redeem", { token: M, shopId: BARBIERE, body: { customerId: c.id } });
    expect(red.json).toMatchObject({ card: { rewardsAvailable: 0 } });
  });

  it("codice inesistente: E_CARD_NOT_FOUND; carta cancellata: E_CARD_DELETED", async () => {
    const nf = await call("lookup", { token: M, shopId: SALONE, body: { code: "ZZZZ2222" } });
    expect([nf.status, nf.code]).toEqual([404, "E_CARD_NOT_FOUND"]);
    expect(ev("customer.lookup.not_found")).toHaveLength(1);
    expect(lines.filter((l) => l.level === "warn")).toHaveLength(1); // http.request.end resta a info

    const c = await newCustomer(SALONE);
    await call("deleteCustomer", { token: G, shopId: SALONE, params: { id: c.id }, body: { reason: "richiesta" } });
    const del = await call("lookup", { token: M, shopId: SALONE, body: { code: c.qr } });
    expect([del.status, del.code]).toEqual([410, "E_CARD_DELETED"]);
  });
});

describe("separazione tra negozi", () => {
  it("un QR valido di un altro negozio: E_QR_OTHER_SHOP, senza dire quale", async () => {
    const c = await newCustomer(BARBIERE);
    const r = await call("lookup", { token: G, shopId: SALONE, body: { code: c.qr } });
    expect([r.status, r.code]).toEqual([404, "E_QR_OTHER_SHOP"]);
    expect(JSON.stringify(r.json)).not.toContain("Barbiere");
    expect(ev("customer.lookup.other_shop")[0]?.shop_name).toBe("Salone Demo");
  });

  it("con l'id di una carta del barbiere, dal salone non si timbra, non si legge, non si trova", async () => {
    const ph = testPhone();
    const c = await newCustomer(BARBIERE, { phone: ph });
    for (const key of ["stamp", "undo", "redeem"] as const) {
      const r = await call(key, { token: M, shopId: SALONE, body: { customerId: c.id } });
      expect(r.code).toBe("E_CARD_NOT_FOUND");
    }
    expect((await call("customer", { token: G, shopId: SALONE, params: { id: c.id } })).code).toBe("E_CARD_NOT_FOUND");
    expect(
      (
        await call("adjust", {
          token: G,
          shopId: SALONE,
          params: { id: c.id },
          body: { stamps: 1, rewards: 0, reason: "prova tra negozi" },
        })
      ).code,
    ).toBe("E_CARD_NOT_FOUND");
    const search = await call("customers", { token: G, shopId: SALONE, query: { q: ph } });
    expect(search.json?.items).toEqual([]);
    const { data } = await admin.from("customers").select("stamps").eq("id", c.id).single();
    expect(data?.stamps).toBe(0);
  });
});

describe("clienti", () => {
  it("ricerca per telefono, codice breve e nome; telefono sempre mascherato; paginazione", async () => {
    const tag = `Zeta${Date.now().toString(36)}`;
    const ph = testPhone();
    const a = await newCustomer(SALONE, { name: `${tag} Uno`, phone: ph });
    await newCustomer(SALONE, { name: `${tag} Due` });
    await newCustomer(SALONE, { name: `${tag} Tre` });

    const byPhone = await call("customers", { token: G, shopId: SALONE, query: { q: ph.replace("+39", "") } });
    expect(byPhone.json?.items).toEqual([
      expect.objectContaining({ id: a.id, phoneMasked: expect.stringMatching(/^\+39 \d{3} \*\*\*\d{4}$/) }),
    ]);
    expect(JSON.stringify(byPhone.json)).not.toContain(ph);

    const byCode = await call("customers", { token: G, shopId: SALONE, query: { q: a.shortCode } });
    expect((byCode.json?.items as Array<{ id: string }>).map((i) => i.id)).toEqual([a.id]);

    const p1 = await call("customers", { token: G, shopId: SALONE, query: { q: tag, limit: "2" } });
    expect((p1.json?.items as unknown[]).length).toBe(2);
    const p2 = await call("customers", {
      token: G,
      shopId: SALONE,
      query: { q: tag, limit: "2", cursor: String(p1.json?.nextCursor) },
    });
    expect((p2.json?.items as unknown[]).length).toBe(1);
    expect(p2.json?.nextCursor).toBeNull();
    expect(ev("customer.search").map((l) => l.query_kind)).toEqual(["telefono", "codice breve", "nome", "nome"]);
    expect(JSON.stringify(lines)).not.toContain(tag); // il testo cercato non va nei log
  });

  it("dettaglio con storico e nome di chi ha agito; rettifica e revoca del consenso dall'API", async () => {
    const c = await newCustomer(SALONE, { marketing: true });
    await call("adjust", {
      token: G,
      shopId: SALONE,
      params: { id: c.id },
      body: { stamps: 4, rewards: 0, reason: "carta cartacea" },
    });
    const grant = await call("marketing", { token: G, shopId: SALONE, params: { id: c.id }, body: { consent: true } });
    expect(grant.json).toMatchObject({ changed: false }); // già dato dal cliente
    const revoke = await call("marketing", {
      token: G,
      shopId: SALONE,
      params: { id: c.id },
      body: { consent: false },
    });
    expect(revoke.json).toMatchObject({ changed: true, consentMarketing: false });
    const again = await call("marketing", { token: G, shopId: SALONE, params: { id: c.id }, body: { consent: true } });
    expect([again.status, again.code]).toEqual([409, "E_CONSENT_BY_CUSTOMER_ONLY"]);
    const d = await call("customer", { token: G, shopId: SALONE, params: { id: c.id } });
    const history = d.json?.history as Array<{ action: string; actorName: string; reason: string | null }>;
    expect(history.map((h) => h.action)).toEqual(["marketing_consent", "adjust", "enroll"]);
    expect(history[1]).toMatchObject({ actorName: "Giulia", reason: "carta cartacea" });
    expect(history[2]?.actorName).toBe("cliente");
  });
});

describe("statistiche", () => {
  it("coerenti con i dati del database", async () => {
    const c = await newCustomer(SALONE);
    await call("stamp", { token: M, shopId: SALONE, body: { customerId: c.id } });
    // altri file iscrivono e cancellano clienti del negozio in parallelo: il totale sta tra i due conteggi
    const total = async () =>
      (
        await admin
          .from("customers")
          .select("id", { count: "exact", head: true })
          .eq("shop_id", SALONE)
          .is("deleted_at", null)
      ).count ?? 0;
    const before = await total();
    const r = await call("stats", { token: G, shopId: SALONE });
    const after = await total();
    const got = Number(r.json?.customersTotal);
    expect(got).toBeGreaterThanOrEqual(Math.min(before, after) - 5);
    expect(got).toBeLessThanOrEqual(Math.max(before, after) + 5);
    expect((r.json?.thisWeek as { stamps: number }).stamps).toBeGreaterThanOrEqual(1);
    expect(ev("stats.viewed")).toHaveLength(1);
  });
});

describe("impostazioni e logo", () => {
  let original: Record<string, unknown> = {};
  beforeAll(async () => {
    original = ((await call("settings", { token: await giulia(), shopId: SALONE })).json?.settings ?? {}) as Record<
      string,
      unknown
    >;
  });
  afterAll(async () => {
    await admin
      .from("shops")
      .update({
        hex_color: original.hexColor,
        stamp_cooldown_minutes: original.stampCooldownMinutes,
        logo_url: null,
        logo_path: null,
      })
      .eq("id", SALONE);
  });

  it("aggiornamento con audit e riepilogo leggibile nel log", async () => {
    const r = await call("updateSettings", {
      token: G,
      shopId: SALONE,
      body: { hexColor: "#0F766E", stampCooldownMinutes: 45 },
    });
    expect(r.json).toMatchObject({ settings: { hexColor: "#0f766e", stampCooldownMinutes: 45 } });
    // valori di partenza letti dal database: il test non dipende da cosa è rimasto da prove precedenti
    expect(ev("settings.update.ok")[0]?.msg).toContain(
      `colore ${String(original.hexColor).toLowerCase()} → #0f766e, minuti minimi tra due timbri ${String(original.stampCooldownMinutes)} → 45`,
    );
    const { data } = await admin
      .from("audit_log")
      .select("before, after")
      .eq("action", "settings_update")
      .eq("entity_id", SALONE)
      .order("id", { ascending: false })
      .limit(1)
      .single();
    expect(data).toMatchObject({
      before: { hex_color: String(original.hexColor).toLowerCase() },
      after: { hex_color: "#0f766e" },
    });

    const bad = await call("updateSettings", { token: G, shopId: SALONE, body: { vatNumber: "123" } });
    expect(bad.code).toBe("E_VALIDATION");
  });

  it("logo: URL firmato, caricamento reale su Storage, poi URL pubblico nelle impostazioni", async () => {
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    );
    const wrong = await call("logoUploadUrl", {
      token: G,
      shopId: SALONE,
      body: { contentType: "image/heic", sizeBytes: 1000 },
    });
    expect(wrong.code).toBe("E_LOGO_INVALID");

    const r = await call("logoUploadUrl", {
      token: G,
      shopId: SALONE,
      body: { contentType: "image/png", sizeBytes: png.length },
    });
    const { path, token } = r.json as { path: string; token: string };
    expect(path.startsWith(`${SALONE}/`)).toBe(true);
    const up = await admin.storage.from("logos").uploadToSignedUrl(path, token, png, { contentType: "image/png" });
    expect(up.error).toBeNull();

    const s = await call("updateSettings", { token: G, shopId: SALONE, body: { logoPath: path } });
    expect((s.json?.settings as { logoUrl: string }).logoUrl).toContain(`/storage/v1/object/public/logos/${path}`);

    const other = await call("updateSettings", { token: G, shopId: SALONE, body: { logoPath: `${BARBIERE}/x.png` } });
    expect(other.code).toBe("E_LOGO_INVALID");
    await admin.storage.from("logos").remove([path]);
  });
});

describe("staff", () => {
  const email = `invito-${Date.now()}@salone-demo.test`;
  let newUserId = "";
  afterAll(async () => {
    if (newUserId) await admin.auth.admin.deleteUser(newUserId);
  });

  it("invito con email (Mailpit), cambio ruolo, rimozione; mai senza titolare", async () => {
    const inv = await call("invite", {
      token: G,
      shopId: SALONE,
      body: { email, displayName: "Sara", role: "operator" },
    });
    expect(inv.json).toMatchObject({ existingAccount: false, member: { displayName: "Sara", role: "operator" } });
    newUserId = (inv.json?.member as { userId: string }).userId;

    const mail = (await (
      await fetch(`${process.env.MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`)
    ).json()) as {
      messages: unknown[];
    };
    expect(mail.messages.length).toBe(1);
    expect(ev("staff.invite.sent")[0]?.msg).toContain("in***@salone-demo.test");
    expect(JSON.stringify(lines)).not.toContain(email);

    expect(
      (await call("invite", { token: G, shopId: SALONE, body: { email, displayName: "Sara", role: "operator" } })).code,
    ).toBe("E_STAFF_ALREADY_MEMBER");

    const promoted = await call("updateStaff", {
      token: G,
      shopId: SALONE,
      params: { userId: newUserId },
      body: { role: "owner" },
    });
    expect(promoted.json).toMatchObject({ member: { role: "owner" } });
    expect(ev("staff.role.changed")[0]?.msg).toContain("operatore → titolare");
    await call("updateStaff", { token: G, shopId: SALONE, params: { userId: newUserId }, body: { role: "operator" } });

    const list = await call("staff", { token: G, shopId: SALONE });
    expect((list.json?.staff as Array<{ displayName: string }>).map((s) => s.displayName)).toEqual(
      expect.arrayContaining(["Giulia", "Marco", "Sara"]),
    );

    const removed = await call("removeStaff", { token: G, shopId: SALONE, params: { userId: newUserId } });
    expect(removed.json).toEqual({ removed: true });

    const self = await call("updateStaff", {
      token: G,
      shopId: SALONE,
      params: { userId: GIULIA },
      body: { role: "operator" },
    });
    expect([self.status, self.code]).toEqual([409, "E_LAST_OWNER"]);
    const selfRemove = await call("removeStaff", { token: G, shopId: SALONE, params: { userId: GIULIA } });
    expect(selfRemove.code).toBe("E_LAST_OWNER");
  });

  it("chi ha già un account viene aggiunto senza email", async () => {
    const r = await call("invite", {
      token: G,
      shopId: SALONE,
      body: { email: "operatore@salone-demo.test", displayName: "Marco", role: "operator" },
    });
    expect(r.code).toBe("E_STAFF_ALREADY_MEMBER"); // Marco è già nel salone: nessuna email, nessun doppione
  });
});

describe("promozioni", () => {
  beforeAll(() => admin.from("promotions").delete().eq("shop_id", SALONE));
  afterAll(() => admin.from("promotions").delete().eq("shop_id", SALONE));

  it("una a settimana, solo con clienti con consenso", async () => {
    await admin.from("customers").update({ consent_marketing: false }).eq("shop_id", SALONE);
    const none = await call("queuePromotion", {
      token: G,
      shopId: SALONE,
      body: { text: "Sconto del 10% questa settimana!" },
    });
    expect(none.code).toBe("E_PROMO_NO_RECIPIENTS");

    await newCustomer(SALONE, { marketing: true });
    const ok = await call("queuePromotion", {
      token: G,
      shopId: SALONE,
      body: { text: "Sconto del 10% questa settimana!" },
    });
    expect(ok.json).toMatchObject({ promotion: { status: "queued", recipients: 1 } });
    expect(ev("promo.send.queued")[0]?.msg).toContain("per 1 clienti con consenso marketing");

    const again = await call("queuePromotion", { token: G, shopId: SALONE, body: { text: "Altra promo" } });
    expect([again.status, again.code]).toEqual([409, "E_PROMO_WEEKLY_LIMIT"]);
    expect((again.json?.error as { message: string }).message).toMatch(/la prossima dal \d+ \w+ alle ore \d\d:\d\d\.$/);

    const list = await call("promotions", { token: G, shopId: SALONE });
    expect((list.json?.promotions as unknown[]).length).toBe(1);
  });
});

describe("diagnostica e cartello", () => {
  it("diagnostica: codice ticket, contenuto redatto prima di salvarlo", async () => {
    const part = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const jwt = [part({ alg: "HS256" }), part({ sub: "x" }), "firmafinta"].join(".");
    const r = await call("diagnostics", {
      token: M,
      shopId: SALONE,
      body: { device: { model: "iPhone 15", os: "iOS 18" }, events: [{ type: "api", note: `token ${jwt}` }] },
    });
    const ticket = (r.json as { ticketCode: string }).ticketCode;
    expect(ticket).toMatch(/^DIAG-[2-9A-HJKMNP-Z]{8}$/);
    const { data } = await admin
      .from("diagnostic_bundles")
      .select("events, user_id")
      .eq("ticket_code", ticket)
      .single();
    expect(JSON.stringify(data?.events)).not.toContain(jwt);
    expect(ev("diagnostics.received")[0]?.ticket_code).toBe(ticket);

    const big = await call("diagnostics", {
      token: M,
      shopId: SALONE,
      rawBody: JSON.stringify({ device: {}, events: [{ x: "a".repeat(300_000) }] }),
    });
    expect([big.status, big.code]).toEqual([413, "E_PAYLOAD_TOO_LARGE"]);
  });

  it("cartello A5 in PDF", async () => {
    const r = await call("counterQr", { token: G, shopId: SALONE });
    expect(r.res.headers.get("content-type")).toBe("application/pdf");
    const pdf = Buffer.from(await r.res.arrayBuffer());
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(5000);
    expect(pdf.toString("latin1")).toMatch(/\/MediaBox \[0 0 419\.\d+ 595\.\d+\]/); // A5 verticale
    expect(ev("counter_qr.downloaded")).toHaveLength(1);
  });
});

describe("rate limit e CORS", () => {
  it("oltre il limite per IP: 429 E_RATE_LIMITED con Retry-After", { timeout: 30_000 }, async () => {
    const before = process.env.RATE_LIMIT_IP_PER_MIN;
    process.env.RATE_LIMIT_IP_PER_MIN = "3";
    try {
      const headers = { "x-forwarded-for": `198.51.100.${Math.floor(Math.random() * 250)}${Date.now() % 1000}` };
      // le finestre del limite sono allineate al minuto: le 4 chiamate non devono attraversarne il cambio
      const leftInWindow = 60_000 - (Date.now() % 60_000);
      if (leftInWindow < 10_000) await new Promise((r) => setTimeout(r, leftInWindow + 200));
      const statuses: number[] = [];
      for (let i = 0; i < 4; i++) statuses.push((await call("me", { token: M, headers })).status);
      expect(statuses).toEqual([200, 200, 200, 429]);
      const r = await call("me", { token: M, headers });
      expect(r.code).toBe("E_RATE_LIMITED");
      expect(Number(r.res.headers.get("retry-after"))).toBeGreaterThan(0);
      expect(ev("ratelimit.hit")[0]).toMatchObject({ scope: "IP", limit: 3 });
    } finally {
      process.env.RATE_LIMIT_IP_PER_MIN = before;
    }
  });

  it("solo le origini della web app esercente", async () => {
    const ok = await call("me", { token: M, headers: { origin: "http://localhost:8081" } });
    expect(ok.res.headers.get("access-control-allow-origin")).toBe("http://localhost:8081");
    expect(ok.res.headers.get("access-control-expose-headers")).toContain("x-request-id");
    const bad = await call("me", { token: M, headers: { origin: "https://sito-di-terzi.example" } });
    expect([bad.status, bad.code]).toEqual([403, "E_CORS_ORIGIN"]);
    expect(bad.res.headers.get("access-control-allow-origin")).toBeNull();
    const native = await call("me", { token: M }); // app iOS/Android: nessuna Origin
    expect(native.status).toBe(200);
  });
});

describe("validazione: input malformati danno E_VALIDATION con il campo", () => {
  const cases: Array<[MerchantEndpoint, Parameters<typeof call>[1], string]> = [
    ["lookup", { body: { code: "xyz" } }, "body.code"],
    ["stamp", { body: { customerId: "nope" } }, "body.customerId"],
    ["undo", { body: {} }, "body.customerId"],
    ["redeem", { body: { customerId: 3 } }, "body.customerId"],
    ["customers", { query: { limit: "0" } }, "query.limit"],
    ["customer", { params: { id: "abc" } }, "params.id"],
    [
      "adjust",
      { params: { id: "00000000-0000-4000-8000-000000000000" }, body: { stamps: -1, rewards: 0, reason: "valido" } },
      "body.stamps",
    ],
    ["deleteCustomer", { params: { id: "abc" } }, "params.id"],
    ["marketing", { params: { id: "00000000-0000-4000-8000-000000000000" }, body: { consent: "si" } }, "body.consent"],
    ["updateSettings", { body: { hexColor: "rosso" } }, "body.hexColor"],
    ["logoUploadUrl", { body: { contentType: 1, sizeBytes: 10 } }, "body.contentType"],
    ["invite", { body: { email: "non-una-email", displayName: "Sara", role: "operator" } }, "body.email"],
    ["updateStaff", { params: { userId: "abc" }, body: { role: "operator" } }, "params.userId"],
    ["removeStaff", { params: { userId: "abc" } }, "params.userId"],
    ["queuePromotion", { body: { text: "" } }, "body.text"],
    ["diagnostics", { body: { device: "x", events: [] } }, "body.device"],
  ];

  it.each(cases)("%s → %s", async (key, opts, field) => {
    const owner = !["lookup", "stamp", "undo", "redeem", "diagnostics"].includes(key);
    const r = await call(key, { token: owner ? G : M, shopId: SALONE, ...opts });
    expect([r.status, r.code]).toEqual([400, "E_VALIDATION"]);
    expect(lines.find((l) => l.event === "http.request.end")?.error_message).toContain(field);
  });

  it("JSON non valido", async () => {
    const r = await call("stamp", { token: M, shopId: SALONE, rawBody: "{non json" });
    expect([r.status, r.code]).toEqual([400, "E_VALIDATION"]);
  });
});
