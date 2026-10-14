-- =============================================================
-- Bucket dei loghi dei negozi: lettura pubblica (Google Wallet deve
-- scaricarli), scrittura solo con URL firmato generato dal backend.
-- Lo Storage rifiuta da sé file oltre 2 MB o di tipo diverso.
-- =============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('logos', 'logos', true, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
