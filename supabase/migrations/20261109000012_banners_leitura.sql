-- O envio com upsert exige permissão de leitura nos objetos do bucket (o bucket já é público)
create policy banners_ler on storage.objects for select to authenticated
  using (bucket_id = 'banners');
