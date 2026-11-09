-- UNIDA ONE — armazenamento das imagens de banner dos eventos (leitura pública, envio por quem pode editar eventos)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('banners', 'banners', true, 3145728, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create or replace function public.posso_subir_banner() returns boolean
language sql stable security definer set search_path = public as $$
  select public.sou_pastor() or public.sou_secretaria() or exists (
    select 1 from public.vinculos v where v.pessoa_id = public.minha_pessoa() and v.ativo
      and v.papel in ('lider','supervisor','coordenador'))
$$;
revoke execute on function public.posso_subir_banner() from public, anon;
grant execute on function public.posso_subir_banner() to authenticated;

create policy banners_enviar on storage.objects for insert to authenticated
  with check (bucket_id = 'banners' and (select public.posso_subir_banner()));
create policy banners_trocar on storage.objects for update to authenticated
  using (bucket_id = 'banners' and (select public.posso_subir_banner()));
create policy banners_apagar on storage.objects for delete to authenticated
  using (bucket_id = 'banners' and (select public.posso_subir_banner()));
