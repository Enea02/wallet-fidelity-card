-- =============================================================
-- Indici per le query di assistenza (audit per negozio, carta,
-- request_id) e per la dashboard (eventi per settimana).
-- =============================================================

create index audit_log_shop_ts_idx       on audit_log (shop_id, ts desc);
create index audit_log_entity_ts_idx     on audit_log (entity, entity_id, ts desc);
create index audit_log_request_id_idx    on audit_log (request_id) where request_id is not null;

create index stamp_events_shop_created_idx on stamp_events (shop_id, created_at desc) where undone_at is null;
create index stamp_events_customer_id_idx  on stamp_events (customer_id, id desc);

create index customers_shop_created_idx  on customers (shop_id, created_at desc) where deleted_at is null;
