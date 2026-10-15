/**
 * Pannello interno (Fase 9) contro il Supabase locale: funzioni dell'assistenza con audit "support",
 * permessi delle funzioni Postgres, ricerca, timeline, GDPR, diagnostica e copia dei log in log_events.
 * L'accesso al pannello (sessione, team, 2FA) si prova negli e2e (apps/web/e2e/interno.spec.ts).
 */
import { randomUUID } from "node:crypto";
import { newRequestId, supportCodeFromRequestId } from "@loyalty/shared/logging/request-id";
import { afterAll, describe, expect, it } from "vitest";
import { runWithContext } from "@/lib/observability/context";
import { flushLogs } from "@/lib/observability/db-sink";
import { phoneHash } from "@/lib/public/links";
import { disableDiagnostic, enableDiagnostic } from "@/lib/support/diagnostics";
import { deleteCustomerGdpr, exportCustomer } from "@/lib/support/gdpr";
import { search } from "@/lib/support/search";
import type { SupportUser } from "@/lib/support/session";
import { createShop, setShopStatus, updateLegal } from "@/lib/support/shops";
import { loadTimeline } from "@/lib/support/timeline";
import { admin, BARBIERE, call, cleanupCustomers, giulia, newCustomer, SALONE } from "./support/merchant";

const enea: SupportUser = { userId: randomUUID(), email: "enea@loyaltywallet.test", name: "Enea" };
const created: string[] = [];
const invited: string[] = [];

/** Esegue come una richiesta del pannello: request_id e piattaforma "interno". */
const asSupport = <T>(fn: () => Promise<T>) =>
  runWithContext({ request_id: newRequestId(), platform: "interno", role: "support", app_version: "n/d" }, fn);

const auditOf = async (filter: { entity_id: string; action: string }) => {
  const { data } = await admin
    .from("audit_log")
    .select("actor_type, actor_id, action, before, after, reason")
    .eq("entity_id", filter.entity_id)
    .eq("action", filter.action);
  return data ?? [];
};

afterAll(async () => {
  if (created.length) await admin.from("shops").delete().in("id", created);
  for (const id of invited) await admin.auth.admin.deleteUser(id).catch(() => undefined);
  await cleanupCustomers();
});

describe("negozi dal pannello", () => {
  it("creazione con invito del titolare: negozio, titolare nello staff, audit support", async () => {
    const slug = `smoke-${Date.now().toString(36)}`;
    const email = `${slug}@esempio.test`;
    const shop = await asSupport(() =>
      createShop(
        {
          name: "Negozio Smoke",
          slug,
          ownerName: "Luca",
          ownerEmail: email,
          legalName: "Negozio Smoke di Luca",
          vatNumber: null,
          privacyEmail: null,
        },
        enea,
      ),
    );
    created.push(shop.id);
    const { data: staff } = await admin.from("staff").select("user_id, role, display_name").eq("shop_id", shop.id);
    expect(staff).toEqual([expect.objectContaining({ role: "owner", display_name: "Luca" })]);
    invited.push(staff![0]!.user_id as string);
    const [audit] = await auditOf({ entity_id: shop.id, action: "shop_create" });
    expect(audit).toMatchObject({ actor_type: "support", actor_id: "Enea" });

    await expect(
      asSupport(() =>
        createShop(
          {
            ...{ name: "Doppio", slug, ownerName: "Luca", ownerEmail: email },
            legalName: null,
            vatNumber: null,
            privacyEmail: null,
          },
          enea,
        ),
      ),
    ).rejects.toMatchObject({ code: "E_SHOP_SLUG_TAKEN" });
  });

  it("slug riservato rifiutato dal database (e l'account invitato non resta)", async () => {
    const email = `riservato-${Date.now()}@esempio.test`;
    await expect(
      asSupport(() =>
        createShop(
          {
            name: "Interno",
            slug: "interno",
            ownerName: "Luca",
            ownerEmail: email,
            legalName: null,
            vatNumber: null,
            privacyEmail: null,
          },
          enea,
        ),
      ),
    ).rejects.toMatchObject({ code: "E_SHOP_SLUG_TAKEN" });
    const { data } = await admin.rpc("find_user_id_by_email", { p_email: email });
    expect(data).toBeNull();
  });

  it("sospensione e riattivazione con motivo; la stessa richiesta due volte non cambia nulla", async () => {
    const id = created[0]!;
    const r1 = await asSupport(() => setShopStatus(id, "suspended", "abbonamento non rinnovato", enea));
    expect(r1.changed).toBe(true);
    const r2 = await asSupport(() => setShopStatus(id, "suspended", "abbonamento non rinnovato", enea));
    expect(r2.changed).toBe(false);
    await asSupport(() => setShopStatus(id, "active", "abbonamento rinnovato", enea));
    const [s] = await auditOf({ entity_id: id, action: "shop_suspend" });
    expect(s).toMatchObject({
      actor_type: "support",
      reason: "abbonamento non rinnovato",
      after: { status: "suspended" },
    });
    await expect(asSupport(() => setShopStatus(id, "suspended", "no", enea))).rejects.toMatchObject({
      code: "E_VALIDATION",
    });
  });

  it("dati per l'informativa: solo i campi cambiati nell'audit", async () => {
    const id = created[0]!;
    const r = await asSupport(() =>
      updateLegal(id, { legalName: "Negozio Smoke di Luca", vatNumber: "IT01234567890", privacyEmail: null }, enea),
    );
    expect(r.changed).toBe(1);
    const [a] = await auditOf({ entity_id: id, action: "shop_legal_update" });
    expect(a?.after).toMatchObject({ vat_number: "IT01234567890" });
  });

  it("le funzioni dell'assistenza rifiutano chi non è support", async () => {
    const { error } = await admin.rpc("set_shop_status", {
      p_shop_id: SALONE,
      p_status: "suspended",
      p_reason: "tentativo dallo staff",
      p_meta: { actor_type: "staff", actor_id: randomUUID() },
    });
    expect(error?.message).toBe("E_SUPPORT_FORBIDDEN");
    const { data } = await admin.from("shops").select("status").eq("id", SALONE).single();
    expect(data?.status).toBe("active");
  });
});

describe("ricerca e timeline", () => {
  it("telefono cercato per hash: trova la carta, nel log solo un estratto dell'hash", async () => {
    const c = await newCustomer(SALONE);
    const { data: row } = await admin.from("customers").select("phone").eq("id", c.id).single();
    const phone = row!.phone as string;
    await admin.rpc("set_customer_phone_hashes", { p_items: [{ id: c.id, phone_hash: phoneHash(phone) }] });
    const r = await asSupport(() => search(phone.replace("+39", ""), enea));
    expect(r.kind).toBe("telefono");
    expect(r.redirect).toBe(`/interno/clienti/${c.id}`);
  });

  it("codice assistenza di un timbro rifiutato: la richiesta con causa e azione del catalogo", async () => {
    const c = await newCustomer(SALONE);
    const token = await giulia();
    await call("stamp", { token, shopId: SALONE, body: { customerId: c.id } });
    const rejected = await call("stamp", { token, shopId: SALONE, body: { customerId: c.id } });
    expect(rejected.code).toBe("E_STAMP_COOLDOWN");
    const requestId = rejected.res.headers.get("x-request-id")!;
    await flushLogs();

    const r = await asSupport(() => search(supportCodeFromRequestId(requestId), enea));
    expect(r.redirect).toBe(`/interno/richieste/${requestId}`);
    const { blocks } = await loadTimeline({ kind: "richiesta", requestIds: [requestId] });
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.errors.map((e) => e.code)).toEqual(["E_STAMP_COOLDOWN"]);
    expect(blocks[0]!.title).toMatch(/rifiutato sulla carta/);

    const card = await loadTimeline({ kind: "cliente", customerId: c.id, shopId: SALONE, shortCode: c.shortCode });
    expect(card.blocks.some((b) => b.request_id === requestId)).toBe(true);
    expect(card.blocks.some((b) => b.items.some((i) => i.source === "audit"))).toBe(true);
  });

  it("codice assistenza solo nell'app (rete assente): trovato nel pacchetto di diagnostica", async () => {
    const requestId = newRequestId();
    const code = supportCodeFromRequestId(requestId);
    const token = await giulia();
    const sent = await call("diagnostics", {
      token,
      shopId: SALONE,
      body: {
        device: { os: "iOS 18", model: "iPhone 15" },
        events: [
          {
            ts: new Date().toISOString(),
            level: "warn",
            event: "app.api.error",
            msg: "Chiamata POST /stamp fallita: il server non ha risposto (rete assente).",
            request_id: requestId,
            error_code: "E_NETWORK",
            support_code: code,
          },
        ],
      },
    });
    expect(sent.status).toBe(200);
    const r = await asSupport(() => search(code, enea));
    expect(r.redirect).toBe(`/interno/richieste/${requestId}`);
    const { blocks } = await loadTimeline({ kind: "richiesta", requestIds: [requestId] });
    expect(blocks[0]!.items[0]!.source).toBe("app");
    expect(blocks[0]!.errors.map((e) => e.code)).toEqual(["E_NETWORK"]);
  });

  it("codice di errore del catalogo: spiegazione e ultime richieste", async () => {
    const r = await asSupport(() => search("E_STAMP_COOLDOWN", enea));
    expect(r.explanation?.action).toBeTruthy();
    expect(r.hits.length).toBeGreaterThan(0);
  });
});

describe("GDPR dal pannello", () => {
  it("esportazione: solo i dati di quel cliente, motivo obbligatorio, audit customer_export", async () => {
    const c = await newCustomer(SALONE, { name: "Ottavia Export", marketing: true });
    await newCustomer(SALONE, { name: "Altro Cliente" });
    await expect(asSupport(() => exportCustomer(c.id, "", enea))).rejects.toMatchObject({ code: "E_VALIDATION" });
    const { body, filename } = await asSupport(() => exportCustomer(c.id, "richiesta di accesso via email", enea));
    const json = JSON.parse(body) as Record<string, { nome?: string; promozioni?: boolean }>;
    expect(filename).toBe(`dati-carta-${c.shortCode}.json`);
    expect(json.cliente?.nome).toBe("Ottavia Export");
    expect(json.consensi?.promozioni).toBe(true);
    expect(body).not.toContain("Altro Cliente");
    const [a] = await auditOf({ entity_id: c.id, action: "customer_export" });
    expect(a).toMatchObject({ actor_type: "support", reason: "richiesta di accesso via email" });
  });

  it("cancellazione: conferma col codice della carta, dati e hash del telefono tolti", async () => {
    const c = await newCustomer(SALONE, { name: "Ugo Cancellato" });
    await expect(
      asSupport(() => deleteCustomerGdpr(SALONE, c.id, "XXXXXXXX", c.shortCode, "richiesta via email", enea)),
    ).rejects.toMatchObject({ code: "E_VALIDATION" });
    await asSupport(() =>
      deleteCustomerGdpr(SALONE, c.id, c.shortCode.toLowerCase(), c.shortCode, "richiesta via email", enea),
    );
    const { data } = await admin
      .from("customers")
      .select("name, phone, phone_hash, deleted_at")
      .eq("id", c.id)
      .single();
    expect(data).toMatchObject({ name: "Cliente cancellato", phone: null, phone_hash: null });
    const [a] = await auditOf({ entity_id: c.id, action: "customer_delete" });
    expect(a).toMatchObject({ actor_type: "support", reason: "richiesta via email" });
  });
});

describe("diagnostica dal pannello", () => {
  it("attivazione e disattivazione con audit support; durata fuori limite rifiutata", async () => {
    await expect(
      asSupport(() =>
        enableDiagnostic({ scopeType: "shop", scopeId: BARBIERE, level: "debug", hours: 200, reason: "prova" }, enea),
      ),
    ).rejects.toMatchObject({ code: "E_VALIDATION" });
    const m = await asSupport(() =>
      enableDiagnostic(
        { scopeType: "shop", scopeId: BARBIERE, level: "debug", hours: 2, reason: "timbri che non arrivano" },
        enea,
      ),
    );
    expect(m.scope_label).toBe("barbiere-demo");
    await asSupport(() => disableDiagnostic(m.id, enea));
    const { data } = await admin.from("diagnostic_modes").select("disabled_by").eq("id", m.id).single();
    expect(data?.disabled_by).toBe("Enea");
    const actions = (
      await admin
        .from("audit_log")
        .select("action")
        .eq("entity_id", BARBIERE)
        .in("action", ["diagnostic_enable", "diagnostic_disable"])
    ).data;
    expect(actions?.map((a) => a.action)).toEqual(expect.arrayContaining(["diagnostic_enable", "diagnostic_disable"]));
  });
});

describe("copia dei log per la vista Assistenza", () => {
  it("le righe di una richiesta finiscono in log_events con i campi di ricerca", async () => {
    const token = await giulia();
    const r = await call("me", { token });
    const requestId = r.res.headers.get("x-request-id")!;
    await flushLogs();
    const { data } = await admin.from("log_events").select("event, level, user_id").eq("request_id", requestId);
    expect(data?.map((d) => d.event)).toEqual(expect.arrayContaining(["http.request.start", "http.request.end"]));
  });

  it("pulizia: righe oltre 30 giorni e di diagnostica oltre 7 giorni", async () => {
    const old = new Date(Date.now() - 31 * 24 * 3600 * 1000).toISOString();
    const diag = new Date(Date.now() - 8 * 24 * 3600 * 1000).toISOString();
    const keep = new Date(Date.now() - 8 * 24 * 3600 * 1000).toISOString();
    const base = { level: "info", event: "stats.viewed", msg: "prova di retention", fields: {}, diagnostic: false };
    const { data: rows } = await admin
      .from("log_events")
      .insert([
        { ...base, ts: old },
        { ...base, ts: diag, level: "debug", diagnostic: true },
        { ...base, ts: keep },
      ])
      .select("id");
    const { data: purged } = await admin.rpc("purge_log_events", { p_limit: 5000 });
    expect(purged.expired).toBeGreaterThanOrEqual(1);
    expect(purged.diagnostic).toBeGreaterThanOrEqual(1);
    const { data: left } = await admin
      .from("log_events")
      .select("id")
      .in(
        "id",
        rows!.map((r) => r.id),
      );
    expect(left).toHaveLength(1);
    await admin
      .from("log_events")
      .delete()
      .in(
        "id",
        rows!.map((r) => r.id),
      );
  });
});
