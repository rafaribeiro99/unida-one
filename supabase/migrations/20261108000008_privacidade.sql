-- UNIDA ONE — privacidade por papel
-- * Status e motivo de confirmação: só a própria pessoa, quem gere o ministério (líder/supervisor/coordenador
--   acima dele), pastores e secretaria.
-- * Liderados veem quem serve no culto (nomes e funções), sem status; quem recusou não aparece para eles.
-- * Telefone e e-mail: a própria pessoa, quem gere a pessoa, os líderes da pessoa (para o liderado falar com eles),
--   pastores, secretaria e admin.

-- ---------------------------------------------------------------------------
-- Alocações: leitura direta só para quem pode ver status
-- ---------------------------------------------------------------------------
create or replace function public.vejo_status(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.sou_pastor() or public.sou_secretaria() or public.gerencio_org(p_org)
$$;

drop policy if exists alocacoes_ler on public.alocacoes;
create policy alocacoes_ler on public.alocacoes for select to authenticated
  using (pessoa_id = (select public.minha_pessoa())
    or exists (select 1 from public.escalas s where s.id = escala_id and public.vejo_status(s.org_id)));

-- Equipes de um culto, com status apenas para quem pode ver
create or replace function public.equipes_do_culto(p_evento uuid)
returns table (escala_id uuid, org_id uuid, org_nome text, publicada boolean, alocacao_id uuid, pessoa_id uuid,
               nome text, funcao text, funcao_ordem int, status text, motivo text, ve_status boolean)
language sql stable security definer set search_path = public as $$
  select s.id, s.org_id, o.nome, s.publicada, al.id, al.pessoa_id, p.nome, f.nome, coalesce(f.ordem, 99),
         case when al.pessoa_id = public.minha_pessoa() or public.vejo_status(s.org_id) then al.status::text end,
         case when al.pessoa_id = public.minha_pessoa() or public.vejo_status(s.org_id) then al.motivo end,
         public.vejo_status(s.org_id)
  from public.eventos ev
  join public.escalas s on s.evento_id = ev.id
  join public.org o on o.id = s.org_id
  join public.alocacoes al on al.escala_id = s.id
  join public.pessoas p on p.id = al.pessoa_id
  left join public.funcoes f on f.id = al.funcao_id
  where ev.id = p_evento
    and ev.unidade_id = public.minha_unidade()
    and (ev.tipo <> 'pastoral' or public.sou_pastor())
    and (s.publicada or public.gerencio_org(s.org_id))
    and (al.status <> 'recusada' or al.pessoa_id = public.minha_pessoa() or public.vejo_status(s.org_id))
$$;

-- ---------------------------------------------------------------------------
-- Contatos (telefone e e-mail)
-- ---------------------------------------------------------------------------
create or replace function public.vejo_contato(p_pessoa uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_pessoa = public.minha_pessoa()
    or public.sou_admin() or public.sou_secretaria() or public.sou_pastor()
    -- eu gerencio esta pessoa
    or exists (select 1 from public.vinculos v where v.pessoa_id = p_pessoa and v.ativo and public.gerencio_org(v.org_id))
    -- esta pessoa é minha líder (lidera, supervisiona ou coordena uma área onde eu sirvo)
    or exists (
      select 1 from public.vinculos meu
      join public.vinculos dele on dele.pessoa_id = p_pessoa and dele.ativo
        and dele.papel in ('lider','supervisor','coordenador')
        and dele.org_id in (select public.org_ancestrais(meu.org_id))
      where meu.pessoa_id = public.minha_pessoa() and meu.ativo)
$$;

create or replace function public.contatos(p_ids uuid[])
returns table (id uuid, telefone text, email text)
language sql stable security definer set search_path = public as $$
  select p.id, p.telefone, p.email from public.pessoas p
  where p.id = any(p_ids) and p.unidade_id = public.minha_unidade() and public.vejo_contato(p.id)
$$;

-- Líderes de quem chama: para o botão "Falar com o líder"
create or replace function public.meus_lideres()
returns table (org_id uuid, org_nome text, pessoa_id uuid, nome text, papel text, telefone text)
language sql stable security definer set search_path = public as $$
  select distinct on (meu.org_id, dele.pessoa_id) meu.org_id, o.nome, p.id, p.nome, dele.papel::text, p.telefone
  from public.vinculos meu
  join public.org o on o.id = meu.org_id
  join public.vinculos dele on dele.ativo and dele.papel in ('lider','supervisor','coordenador')
    and dele.org_id in (select public.org_ancestrais(meu.org_id))
  join public.pessoas p on p.id = dele.pessoa_id and p.ativo
  where meu.pessoa_id = public.minha_pessoa() and meu.ativo and meu.papel = 'membro' and dele.pessoa_id <> meu.pessoa_id
  order by meu.org_id, dele.pessoa_id
$$;

-- Telefone e e-mail deixam de ser lidos direto da tabela (só pelas funções acima)
revoke select on public.pessoas from authenticated;
grant select (id, unidade_id, user_id, nome, is_admin, ativo, criado_em) on public.pessoas to authenticated;

revoke execute on function public.vejo_status(uuid), public.vejo_contato(uuid) from public, anon;
grant execute on function public.vejo_status(uuid), public.vejo_contato(uuid) to authenticated;
revoke execute on function public.equipes_do_culto(uuid), public.contatos(uuid[]), public.meus_lideres() from public, anon;
grant execute on function public.equipes_do_culto(uuid), public.contatos(uuid[]), public.meus_lideres() to authenticated;
