-- UNIDA ONE — fila de envio do WhatsApp (processada pela função de servidor "whatsapp")

-- Reserva até p_n mensagens pendentes (evita envio duplicado quando duas execuções rodam juntas)
create or replace function public.pegar_fila(p_n int default 25)
returns table (id uuid, telefone text, mensagem text)
language plpgsql security definer set search_path = public as $$
begin
  return query
  with alvo as (
    select n.id from public.notificacoes n
    where n.whatsapp_status = 'pendente' and n.criado_em > now() - interval '3 days'
    order by n.criado_em limit p_n for update skip locked
  ), upd as (
    update public.notificacoes n set whatsapp_status = 'enviando', tentativas = n.tentativas + 1
    from alvo where n.id = alvo.id returning n.id, n.pessoa_id, n.mensagem
  )
  select upd.id, p.telefone, upd.mensagem from upd join public.pessoas p on p.id = upd.pessoa_id;
end $$;

create or replace function public.marcar_envio(p_id uuid, p_ok boolean, p_erro text default null) returns void
language sql security definer set search_path = public as $$
  update public.notificacoes set
    whatsapp_status = case when p_ok then 'enviada' when tentativas >= 3 then 'erro' else 'pendente' end,
    enviado_em = case when p_ok then now() else enviado_em end,
    erro = case when p_ok then null else left(p_erro, 300) end
  where id = p_id
$$;

-- Libera mensagens presas em "enviando" (execução interrompida)
create or replace function public.destravar_fila() returns void
language sql security definer set search_path = public as $$
  update public.notificacoes set whatsapp_status = 'pendente'
  where whatsapp_status = 'enviando' and coalesce(enviado_em, criado_em) < now() - interval '10 minutes' and tentativas < 3
$$;

-- Painel do admin
create or replace function public.fila_whatsapp() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.sou_admin() then raise exception 'Somente administradores.'; end if;
  return jsonb_build_object(
    'resumo', (select coalesce(jsonb_object_agg(whatsapp_status, c), '{}') from (select whatsapp_status, count(*) c from public.notificacoes group by 1) x),
    'ultimas', (select coalesce(jsonb_agg(x), '[]') from (
      select p.nome, n.titulo, n.whatsapp_status, n.erro, n.criado_em from public.notificacoes n
      join public.pessoas p on p.id = n.pessoa_id order by n.criado_em desc limit 30) x));
end $$;

revoke execute on function public.pegar_fila(int), public.marcar_envio(uuid, boolean, text), public.destravar_fila() from public, anon, authenticated;
grant execute on function public.pegar_fila(int), public.marcar_envio(uuid, boolean, text), public.destravar_fila() to service_role;
revoke execute on function public.fila_whatsapp() from public, anon;
grant execute on function public.fila_whatsapp() to authenticated;
