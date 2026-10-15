/**
 * Fase 8, area titolare: statistiche della dashboard, lista clienti con filtri e ultima visita,
 * impostazioni (icona, frase d'apertura, timbri 5-20), verifica del logo, staff con timbri dati,
 * inviti in attesa e reinvio.
 */
import type { LogLine } from "@loyalty/shared/logger";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { setLogSink } from "@/lib/observability/logger";
import { BARBIERE, SALONE, admin, call, cleanupCustomers, giulia, marco, newCustomer } from "./support/merchant";

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
const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();

interface Stats {
  customersTotal: number;
  inactive60Days: number;
  inactiveMarketing: number;
  inactiveRecent: Array<{ customerId: string; name: string; lastActivityAt: string }>;
  thisWeek: { stamps: number; unlocked: number; redeems: number; enrollments: number };
}
const stats = async (token: string, shopId: string) =>
  (await call("stats", { token, shopId })).json as unknown as Stats;

describe("statistiche della dashboard", () => {
  it("premi sbloccati nella settimana, inattivi con consenso, inattivi più recenti", async () => {
    const before = await stats(G, SALONE);

    // un cliente che completa la carta questa settimana (salone-demo: 10 timbri, cooldown aggirato con force)
    const c = await newCustomer(SALONE);
    for (let i = 0; i < 10; i++) {
      const r = await call("stamp", {
        token: G,
        shopId: SALONE,
        body: { customerId: c.id, ...(i > 0 && { force: true }) },
      });
      expect([i, r.status, r.code]).toEqual([i, 200, undefined]);
    }
    // due clienti inattivi da 90 giorni, uno con consenso marketing
    const [old1, old2] = await Promise.all([
      newCustomer(SALONE, { name: "Ottavio Vecchio", marketing: true }),
      newCustomer(SALONE, { name: "Ottone Antico" }),
    ]);
    await admin
      .from("customers")
      .update({ created_at: daysAgo(90) })
      .in("id", [old1.id, old2.id]);

    // altri file di smoke timbrano su salone-demo in parallelo: le differenze sono "almeno" le nostre
    const after = await stats(G, SALONE);
    expect(after.thisWeek.unlocked - before.thisWeek.unlocked).toBeGreaterThanOrEqual(1);
    expect(after.thisWeek.stamps - before.thisWeek.stamps).toBeGreaterThanOrEqual(10);
    expect(after.inactive60Days - before.inactive60Days).toBeGreaterThanOrEqual(2);
    expect(after.inactiveMarketing - before.inactiveMarketing).toBeGreaterThanOrEqual(1);
    expect(after.inactiveRecent.length).toBeLessThanOrEqual(5);
    expect(after.inactiveRecent.map((r) => r.customerId)).toEqual(expect.arrayContaining([old1.id, old2.id]));
    expect(ev("stats.viewed")).toHaveLength(2);
  });
});

describe("lista clienti", () => {
  it("filtri Con premio e Inattivi; ultima visita (null se mai tornato)", async () => {
    const [withReward, inactive, fresh] = await Promise.all([
      newCustomer(BARBIERE, { name: "Zelda Premio" }),
      newCustomer(BARBIERE, { name: "Zelda Inattiva" }),
      newCustomer(BARBIERE, { name: "Zelda Nuova" }),
    ]);
    await admin.from("customers").update({ rewards_available: 1 }).eq("id", withReward.id);
    await admin
      .from("customers")
      .update({ created_at: daysAgo(70) })
      .eq("id", inactive.id);
    await call("stamp", { token: M, shopId: BARBIERE, body: { customerId: fresh.id } });

    const ids = async (filter: "tutti" | "premio" | "inattivi") => {
      const r = await call("customers", { token: M, shopId: BARBIERE, query: { q: "Zelda", filter } });
      return r.status === 200 ? (r.json?.items as Array<{ id: string; lastVisitAt: string | null }>) : r.code;
    };
    // la lista clienti è del titolare: l'operatore non la vede
    expect(await ids("tutti")).toBe("E_FORBIDDEN_ROLE");
  });

  it("dal titolare: filtri e ultima visita", async () => {
    const [withReward, inactive, fresh] = await Promise.all([
      newCustomer(SALONE, { name: "Zaira Premio" }),
      newCustomer(SALONE, { name: "Zaira Inattiva" }),
      newCustomer(SALONE, { name: "Zaira Nuova" }),
    ]);
    await admin.from("customers").update({ rewards_available: 1 }).eq("id", withReward.id);
    await admin
      .from("customers")
      .update({ created_at: daysAgo(70) })
      .eq("id", inactive.id);
    await call("stamp", { token: G, shopId: SALONE, body: { customerId: fresh.id } });

    const list = async (filter: "tutti" | "premio" | "inattivi") =>
      (await call("customers", { token: G, shopId: SALONE, query: { q: "Zaira", filter } })).json?.items as Array<{
        id: string;
        lastVisitAt: string | null;
      }>;
    const all = await list("tutti");
    expect(all.map((c) => c.id).sort()).toEqual([withReward.id, inactive.id, fresh.id].sort());
    expect(all.find((c) => c.id === fresh.id)?.lastVisitAt).not.toBeNull();
    expect(all.find((c) => c.id === inactive.id)?.lastVisitAt).toBeNull();
    expect((await list("premio")).map((c) => c.id)).toEqual([withReward.id]);
    expect((await list("inattivi")).map((c) => c.id)).toEqual([inactive.id]);

    const d = await call("customer", { token: G, shopId: SALONE, params: { id: fresh.id } });
    expect((d.json?.customer as { lastVisitAt: string | null }).lastVisitAt).not.toBeNull();
  });
});

describe("impostazioni della carta", () => {
  let original: Record<string, unknown> = {};
  beforeAll(async () => {
    original = ((await call("settings", { token: G, shopId: SALONE })).json?.settings ?? {}) as Record<string, unknown>;
  });
  afterAll(async () => {
    await admin
      .from("shops")
      .update({ stamp_icon: original.stampIcon, tagline: original.tagline, logo_url: null, logo_path: null })
      .eq("id", SALONE);
  });

  it("icona del timbro e frase d'apertura: salvate, in audit, la carta Google si riallinea", async () => {
    const r = await call("updateSettings", {
      token: G,
      shopId: SALONE,
      body: { stampIcon: "sparkle", tagline: "Ogni 10 pieghe, una è nostra." },
    });
    expect(r.json).toMatchObject({ settings: { stampIcon: "sparkle", tagline: "Ogni 10 pieghe, una è nostra." } });
    expect(ev("settings.update.ok")[0]?.msg).toContain("icona del timbro scissors → sparkle");
    const { data } = await admin.from("shops").select("card_version").eq("id", SALONE).single();
    expect(Number(data?.card_version)).toBeGreaterThan(0);

    const cleared = await call("updateSettings", { token: G, shopId: SALONE, body: { tagline: null } });
    expect(cleared.json).toMatchObject({ settings: { tagline: null } });
  });

  it("timbri necessari da 5 a 20", async () => {
    for (const n of [4, 21]) {
      const r = await call("updateSettings", { token: G, shopId: SALONE, body: { stampsRequired: n } });
      expect([n, r.code]).toEqual([n, "E_VALIDATION"]);
    }
  });

  it("logo: verificato al salvataggio (logo.upload.ok); file mancante → logo.upload.failed", async () => {
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    );
    const u = await call("logoUploadUrl", {
      token: G,
      shopId: SALONE,
      body: { contentType: "image/png", sizeBytes: png.length },
    });
    const { path, token } = u.json as { path: string; token: string };
    await admin.storage.from("logos").uploadToSignedUrl(path, token, png, { contentType: "image/png" });
    await call("updateSettings", { token: G, shopId: SALONE, body: { logoPath: path } });
    expect(ev("logo.upload.ok")[0]).toMatchObject({ content_type: "image/png", size_bytes: png.length });

    const missing = await call("updateSettings", {
      token: G,
      shopId: SALONE,
      body: { logoPath: `${SALONE}/mai-caricato.png` },
    });
    expect(missing.code).toBe("E_LOGO_INVALID");
    expect(ev("logo.upload.failed")[0]).toMatchObject({ stage: "verifica", http_status: 404 });
    // l'errore è registrato una volta sola: logo.upload.failed (warn), la richiesta scende a info
    expect(lines.filter((l) => l.level === "warn").map((l) => l.event)).toEqual(["logo.upload.failed"]);
    await admin.storage.from("logos").remove([path]);
  });
});

describe("staff", () => {
  const email = `riepilogo-${Date.now()}@salone-demo.test`;
  let newUserId = "";
  afterAll(async () => {
    if (newUserId) await admin.auth.admin.deleteUser(newUserId);
  });

  it("timbri dati da ognuno, invito in attesa, reinvio (Mailpit) solo a chi non ha accettato", async () => {
    const inv = await call("invite", {
      token: G,
      shopId: SALONE,
      body: { email, displayName: "Ilaria", role: "operator" },
    });
    newUserId = (inv.json?.member as { userId: string }).userId;
    expect(inv.json?.member).toMatchObject({ invitePending: true, stampsGiven: 0 });

    const list = (await call("staff", { token: G, shopId: SALONE })).json?.staff as Array<{
      displayName: string;
      role: string;
      stampsGiven: number;
      invitePending: boolean;
      invitedAt: string | null;
      userId: string;
    }>;
    expect(list[0]?.role).toBe("owner"); // titolari in cima
    const giuliaRow = list.find((m) => m.displayName === "Giulia");
    expect(giuliaRow?.invitePending).toBe(false);
    expect(giuliaRow?.stampsGiven).toBeGreaterThan(0);
    expect(list.find((m) => m.userId === newUserId)?.invitedAt).not.toBeNull();

    const r = await call("resendInvite", { token: G, shopId: SALONE, params: { userId: newUserId } });
    expect(r.status).toBe(200);
    expect(ev("staff.invite.resent")[0]?.msg).toContain(
      "ha reinviato l'invito del negozio Salone Demo a Ilaria (ri***@",
    );
    const mail = (await (
      await fetch(`${process.env.MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`)
    ).json()) as { messages: unknown[] };
    expect(mail.messages.length).toBe(2);

    const accepted = await call("resendInvite", { token: G, shopId: SALONE, params: { userId: giuliaRow!.userId } });
    expect(accepted.code).toBe("E_VALIDATION");
    // solo il titolare
    expect((await call("resendInvite", { token: M, shopId: SALONE, params: { userId: newUserId } })).code).toBe(
      "E_FORBIDDEN_ROLE",
    );
  });
});
