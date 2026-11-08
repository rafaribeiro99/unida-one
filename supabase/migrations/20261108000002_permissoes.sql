-- UNIDA ONE — funções de permissão e políticas de acesso (RLS)
--
-- Regras:
--  * Admin (pessoas.is_admin) faz tudo.
--  * "Gerir" uma unidade da árvore = ser coordenador, supervisor ou líder nela ou em qualquer nó acima.
--  * "Supervisionar" = ser coordenador ou supervisor nela ou acima (aprova convites e eventos do ministério).
--  * Secretaria (vínculo papel 'secretaria') gere a agenda geral e aprova pedidos de evento.
--  * Pastores veem eventos pastorais entre si; os demais não.
--  * Escalas publicadas são visíveis para todos que servem; rascunhos só para quem gere o ministério.

-- ---------------------------------------------------------------------------
-- Funções auxiliares
-- ---------------------------------------------------------------------------
create or replace function public.minha_pessoa() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.pessoas where user_id = auth.uid() and ativo limit 1
$$;

create or replace function public.minha_unidade() returns uuid
language sql stable security definer set search_path = public as $$
  select unidade_id from public.pessoas where user_id = auth.uid() and ativo limit 1
$$;

create or replace function public.sou_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.pessoas where user_id = auth.uid() and ativo limit 1), false)
$$;

create or replace function public.org_ancestrais(p_org uuid) returns setof uuid
language sql stable security definer set search_path = public as $$
  with recursive a as (
    select id, parent_id from public.org where id = p_org
    union all
    select o.id, o.parent_id from public.org o join a on o.id = a.parent_id
  ) select id from a
$$;

create or replace function public.tem_papel_em(p_pessoa uuid, p_org uuid, p_papeis public.papel_tipo[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.vinculos v
    where v.pessoa_id = p_pessoa and v.ativo and v.papel = any(p_papeis)
      and v.org_id in (select public.org_ancestrais(p_org))
  )
$$;

create or replace function public.gerencio_org(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_org is not null and ((select public.sou_admin())
    or public.tem_papel_em((select public.minha_pessoa()), p_org, array['coordenador','supervisor','lider']::public.papel_tipo[]))
$$;

create or replace function public.supervisiono_org(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_org is not null and ((select public.sou_admin())
    or public.tem_papel_em((select public.minha_pessoa()), p_org, array['coordenador','supervisor']::public.papel_tipo[]))
$$;

create or replace function public.sou_secretaria() returns boolean
language sql stable security definer set search_path = public as $$
  select (select public.sou_admin()) or exists (
    select 1 from public.vinculos where pessoa_id = (select public.minha_pessoa()) and ativo and papel = 'secretaria')
$$;

create or replace function public.sou_pastor() returns boolean
language sql stable security definer set search_path = public as $$
  select (select public.sou_admin()) or exists (
    select 1 from public.vinculos where pessoa_id = (select public.minha_pessoa()) and ativo and papel = 'pastor')
$$;

-- Pode criar/alterar/cancelar este evento sem pedir aprovação?
create or replace function public.posso_editar_evento_direto(p_org uuid, p_tipo public.evento_tipo) returns boolean
language sql stable security definer set search_path = public as $$
  select public.sou_secretaria()
    or (p_org is not null and public.supervisiono_org(p_org))
    or (p_org is not null and p_tipo in ('ensaio','reuniao') and public.gerencio_org(p_org))
$$;

-- Pode decidir esta solicitação?
create or replace function public.posso_decidir(p_sol public.solicitacoes) returns boolean
language sql stable security definer set search_path = public as $$
  select case p_sol.tipo
    when 'convite' then public.supervisiono_org(p_sol.org_id)
    when 'troca' then public.gerencio_org(p_sol.org_id)
    else public.sou_secretaria() or public.supervisiono_org(p_sol.org_id)
  end and coalesce(p_sol.solicitante_id <> (select public.minha_pessoa()), true) or (select public.sou_admin())
$$;

-- ---------------------------------------------------------------------------
-- Proteções contra auto-promoção
-- ---------------------------------------------------------------------------
create or replace function public.trg_pessoas_protecao() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not (select public.sou_admin()) then
    if new.is_admin is distinct from old.is_admin
       or new.user_id is distinct from old.user_id
       or new.unidade_id is distinct from old.unidade_id
       or new.ativo is distinct from old.ativo then
      raise exception 'Sem permissão para alterar estes dados.';
    end if;
  end if;
  return new;
end $$;
create trigger pessoas_protecao before update on public.pessoas
  for each row execute function public.trg_pessoas_protecao();

create or replace function public.trg_vinculos_protecao() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.supervisiono_org(new.org_id) then
    if tg_op = 'INSERT' or new.papel is distinct from old.papel or new.pessoa_id is distinct from old.pessoa_id
       or new.org_id is distinct from old.org_id then
      raise exception 'Somente supervisores podem adicionar pessoas ou alterar papéis.';
    end if;
  end if;
  return new;
end $$;
create trigger vinculos_protecao before insert or update on public.vinculos
  for each row execute function public.trg_vinculos_protecao();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.config enable row level security;
alter table public.unidades enable row level security;
alter table public.pessoas enable row level security;
alter table public.org enable row level security;
alter table public.funcoes enable row level security;
alter table public.vinculos enable row level security;
alter table public.eventos enable row level security;
alter table public.escalas enable row level security;
alter table public.alocacoes enable row level security;
alter table public.indisponibilidades enable row level security;
alter table public.solicitacoes enable row level security;
alter table public.convites enable row level security;
alter table public.notificacoes enable row level security;

-- config
create policy config_ler on public.config for select to authenticated using (true);
create policy config_admin on public.config for all to authenticated using ((select public.sou_admin())) with check ((select public.sou_admin()));

-- unidades
create policy unidades_ler on public.unidades for select to authenticated using (true);
create policy unidades_admin on public.unidades for all to authenticated using ((select public.sou_admin())) with check ((select public.sou_admin()));

-- pessoas
create policy pessoas_ler on public.pessoas for select to authenticated
  using (unidade_id = (select public.minha_unidade()) or (select public.sou_admin()));
create policy pessoas_editar_proprio on public.pessoas for update to authenticated
  using (user_id = auth.uid() or (select public.sou_admin())) with check (user_id = auth.uid() or (select public.sou_admin()));
create policy pessoas_admin_inserir on public.pessoas for insert to authenticated with check ((select public.sou_admin()));
create policy pessoas_admin_excluir on public.pessoas for delete to authenticated using ((select public.sou_admin()));

-- org
create policy org_ler on public.org for select to authenticated
  using (unidade_id = (select public.minha_unidade()) or (select public.sou_admin()));
create policy org_inserir on public.org for insert to authenticated
  with check ((select public.sou_admin()) or (tipo = 'equipe' and public.gerencio_org(parent_id)));
create policy org_editar on public.org for update to authenticated
  using ((select public.sou_admin()) or (tipo = 'equipe' and public.gerencio_org(id)))
  with check ((select public.sou_admin()) or (tipo = 'equipe' and public.gerencio_org(parent_id)));
create policy org_excluir on public.org for delete to authenticated
  using ((select public.sou_admin()) or (tipo = 'equipe' and public.gerencio_org(id)));

-- funcoes
create policy funcoes_ler on public.funcoes for select to authenticated using (true);
create policy funcoes_gerir on public.funcoes for all to authenticated
  using (public.gerencio_org(org_id)) with check (public.gerencio_org(org_id));

-- vinculos (inserir/alterar papel só supervisão: ver trigger; líder pode ajustar funções e ativo)
create policy vinculos_ler on public.vinculos for select to authenticated
  using (exists (select 1 from public.org o where o.id = org_id));
create policy vinculos_inserir on public.vinculos for insert to authenticated
  with check (public.supervisiono_org(org_id));
create policy vinculos_editar on public.vinculos for update to authenticated
  using (public.gerencio_org(org_id)) with check (public.gerencio_org(org_id));
create policy vinculos_excluir on public.vinculos for delete to authenticated
  using (public.supervisiono_org(org_id));

-- eventos
create policy eventos_ler on public.eventos for select to authenticated
  using ((unidade_id = (select public.minha_unidade()) or (select public.sou_admin()))
    and (tipo <> 'pastoral' or (select public.sou_pastor())));
create policy eventos_inserir on public.eventos for insert to authenticated
  with check (public.posso_editar_evento_direto(org_id, tipo));
create policy eventos_editar on public.eventos for update to authenticated
  using (public.posso_editar_evento_direto(org_id, tipo))
  with check (public.posso_editar_evento_direto(org_id, tipo));
create policy eventos_excluir on public.eventos for delete to authenticated
  using (public.posso_editar_evento_direto(org_id, tipo));

-- escalas
create policy escalas_ler on public.escalas for select to authenticated
  using (exists (select 1 from public.eventos e where e.id = evento_id)
    and (publicada or public.gerencio_org(org_id)));
create policy escalas_gerir on public.escalas for all to authenticated
  using (public.gerencio_org(org_id)) with check (public.gerencio_org(org_id));

-- alocacoes
create policy alocacoes_ler on public.alocacoes for select to authenticated
  using (pessoa_id = (select public.minha_pessoa()) or exists (select 1 from public.escalas s where s.id = escala_id));
create policy alocacoes_gerir on public.alocacoes for all to authenticated
  using (exists (select 1 from public.escalas s where s.id = escala_id and public.gerencio_org(s.org_id)))
  with check (exists (select 1 from public.escalas s where s.id = escala_id and public.gerencio_org(s.org_id)));

-- indisponibilidades
create policy indisp_ler on public.indisponibilidades for select to authenticated
  using (exists (select 1 from public.pessoas p where p.id = pessoa_id));
create policy indisp_gerir on public.indisponibilidades for all to authenticated
  using (pessoa_id = (select public.minha_pessoa()) or (select public.sou_admin()))
  with check (pessoa_id = (select public.minha_pessoa()) or (select public.sou_admin()));

-- solicitacoes (criação e decisão só por funções RPC)
create policy solicitacoes_ler on public.solicitacoes for select to authenticated
  using (solicitante_id = (select public.minha_pessoa()) or public.posso_decidir(solicitacoes));

-- convites: sem acesso direto (somente funções)
create policy convites_admin on public.convites for select to authenticated using ((select public.sou_admin()));

-- notificacoes
create policy notificacoes_ler on public.notificacoes for select to authenticated
  using (pessoa_id = (select public.minha_pessoa()));
create policy notificacoes_marcar on public.notificacoes for update to authenticated
  using (pessoa_id = (select public.minha_pessoa())) with check (pessoa_id = (select public.minha_pessoa()));
