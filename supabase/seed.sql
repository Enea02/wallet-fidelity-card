-- =============================================================
-- Dati di prova per lo SVILUPPO LOCALE (applicati da `pnpm db:reset`).
-- Le credenziali qui sotto valgono solo per il Supabase locale:
-- non usarle mai in un progetto remoto.
--
--   salone-demo    Giulia (titolare) + Marco (operatore), cooldown 60 min
--   barbiere-demo  solo Marco (operatore), cooldown 0: test di concorrenza e tra negozi
-- =============================================================

insert into shops (id, slug, name, stamps_required, reward_label, logo_url, hex_color, stamp_cooldown_minutes,
                   legal_name, vat_number, privacy_email)
values
  ('11111111-1111-4111-8111-111111111111', 'salone-demo', 'Salone Demo', 10, 'Taglio gratis', null, '#7c3aed', 60,
   'Salone Demo di Mario Rossi', 'IT01234567890', 'privacy@salone-demo.test'),
  ('44444444-4444-4444-8444-444444444444', 'barbiere-demo', 'Barbiere Demo', 10, 'Barba gratis', null, '#0f766e', 0,
   null, null, null);

-- negozio sempre sospeso: pagine e test della sospensione senza toccare gli altri negozi
insert into shops (id, slug, name, stamps_required, reward_label, hex_color, status)
values ('77777777-7777-4777-8777-777777777777', 'negozio-sospeso', 'Negozio Sospeso', 10, 'Premio', '#5B1F2E', 'suspended');

-- testi e icona come nel design (preset "salone")
update shops set program_name = 'Carta Amica', stamp_unit = 'taglio', stamp_unit_plural = 'tagli',
                 tagline = 'Ogni 10 tagli, uno è gratis.', stamp_icon = 'scissors'
 where slug = 'salone-demo';
update shops set stamp_unit = 'barba', stamp_unit_plural = 'barbe', stamp_icon = 'scissors' where slug = 'barbiere-demo';

-- Utenti staff di prova (password per entrambi: password-demo-locale)
--   staff@salone-demo.test       Giulia Demo, titolare di salone-demo
--   operatore@salone-demo.test   Marco Demo, operatore di salone-demo e barbiere-demo
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change_token_current,
  email_change, phone_change, phone_change_token, reauthentication_token
)
select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
       extensions.crypt('password-demo-locale', extensions.gen_salt('bf')), now(),
       '{"provider":"email","providers":["email"]}', jsonb_build_object('name', u.name), now(), now(),
       '', '', '', '', '', '', '', ''
from (values
  ('22222222-2222-4222-8222-222222222222'::uuid, 'staff@salone-demo.test', 'Giulia Demo'),
  ('55555555-5555-4555-8555-555555555555'::uuid, 'operatore@salone-demo.test', 'Marco Demo'),
  ('99999999-9999-4999-8999-999999999999'::uuid, 'titolare@bar-punti.test', 'Paola Demo')
) as u(id, email, name);

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select id, id, id, jsonb_build_object('sub', id, 'email', email, 'email_verified', true), 'email', now(), now(), now()
from auth.users
where id in ('22222222-2222-4222-8222-222222222222', '55555555-5555-4555-8555-555555555555',
             '99999999-9999-4999-8999-999999999999');

insert into staff (user_id, shop_id, role, display_name)
values
  ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111', 'owner', 'Giulia'),
  ('55555555-5555-4555-8555-555555555555', '11111111-1111-4111-8111-111111111111', 'operator', 'Marco'),
  ('55555555-5555-4555-8555-555555555555', '44444444-4444-4444-8444-444444444444', 'operator', 'Marco');

-- Carta a punti (Fase 9.6): negozio a punti con un titolare tutto suo (gli altri utenti demo non cambiano)
--   titolare@bar-punti.test   Paola Demo, titolare di bar-punti-demo (password-demo-locale)
insert into shops (id, slug, name, stamps_required, reward_label, hex_color, stamp_cooldown_minutes, legal_name,
                   privacy_email, program_name, loyalty_mode, points_per_euro, points_min_cents, points_levels)
values ('88888888-8888-4888-8888-888888888888', 'bar-punti-demo', 'Bar Punti Demo', 10, 'Caffè gratis', '#9a3412', 0,
        'Bar Punti Demo di Paola Bianchi', 'privacy@bar-punti.test', 'Club Bar', 'punti', 1, 0,
        '[{"name":"Silver","min":0,"perk":""},{"name":"Gold","min":100,"perk":"-5% su tutto"},{"name":"Platinum","min":300,"perk":"-10% su tutto"}]');
insert into staff (user_id, shop_id, role, display_name)
values ('99999999-9999-4999-8999-999999999999', '88888888-8888-4888-8888-888888888888', 'owner', 'Paola');

-- Cliente di prova con QR fisso, per provare /staff senza iscriversi.
-- Contenuto del QR: 0123456789abcdef0123456789abcdef · codice breve: DEMA2345
insert into customers (id, shop_id, name, phone, consent_privacy, consent_marketing, qr_token, short_code)
values (
  '33333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111',
  'Cliente Demo', '+390000000001', true, false, '0123456789abcdef0123456789abcdef', 'DEMA2345'
);
