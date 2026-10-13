-- =============================================================
-- Dati di prova per lo SVILUPPO LOCALE (applicati da `pnpm db:reset`).
-- Le credenziali qui sotto valgono solo per il Supabase locale:
-- non usarle mai in un progetto remoto.
-- =============================================================

-- Negozio di prova
insert into shops (id, slug, name, stamps_required, reward_label, logo_url, hex_color)
values ('11111111-1111-4111-8111-111111111111', 'salone-demo', 'Salone Demo', 10, 'Taglio gratis', null, '#7c3aed');

-- Utente staff di prova: staff@salone-demo.test / password-demo-locale
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change_token_current,
  email_change, phone_change, phone_change_token, reauthentication_token
) values (
  '00000000-0000-0000-0000-000000000000', '22222222-2222-4222-8222-222222222222',
  'authenticated', 'authenticated', 'staff@salone-demo.test',
  extensions.crypt('password-demo-locale', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{"name":"Giulia Demo"}', now(), now(),
  '', '', '', '', '', '', '', ''
);

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
values (
  '22222222-2222-4222-8222-222222222222', '22222222-2222-4222-8222-222222222222',
  '22222222-2222-4222-8222-222222222222',
  '{"sub":"22222222-2222-4222-8222-222222222222","email":"staff@salone-demo.test","email_verified":true}',
  'email', now(), now(), now()
);

insert into staff (user_id, shop_id)
values ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111');

-- Cliente di prova con QR fisso, per provare /staff senza iscriversi.
-- Contenuto del QR: 0123456789abcdef0123456789abcdef
insert into customers (id, shop_id, name, phone, consent_privacy, consent_marketing, qr_token)
values (
  '33333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111',
  'Cliente Demo', '+390000000001', true, false, '0123456789abcdef0123456789abcdef'
);
