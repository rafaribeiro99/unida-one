-- UNIDA ONE — liturgia (programação do culto), repertório do louvor e banner por evento
--
-- Liturgia: itens em ordem. Cada item pode apontar para uma função de uma escala (ex.: Pastoral · Oferta);
-- o responsável é lido da escala publicada, sem digitar nomes toda semana.
-- Repertório: músicas reutilizáveis (biblioteca) + lista por culto, editada por quem gere o ministério de louvor.

alter table public.org add column if not exists tem_repertorio boolean not null default false;
update public.org set tem_repertorio = true where tipo = 'ministerio' and nome = 'Louvor';

alter table public.eventos add column if not exists banner_url text;

create table public.liturgia_itens (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid not null references public.eventos(id) on delete cascade,
  ordem int not null default 0,
  titulo text not null,
  org_id uuid references public.org(id) on delete set null,        -- ministério responsável (opcional)
  funcao_id uuid references public.funcoes(id) on delete set null, -- função da escala que define o responsável (opcional)
  responsavel_texto text,                                          -- quando não vem da escala
  horario time,
  observacao text,
  criado_em timestamptz not null default now()
);
create index liturgia_evento_idx on public.liturgia_itens(evento_id, ordem);

create table public.musicas (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid not null references public.unidades(id),
  titulo text not null,
  artista text,
  tom text,
  link text,        -- YouTube / Spotify
  cifra_link text,
  criado_em timestamptz not null default now()
);
create index musicas_titulo_idx on public.musicas(unidade_id, lower(titulo));

create table public.repertorio (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid not null references public.eventos(id) on delete cascade,
  org_id uuid not null references public.org(id) on delete cascade,
  musica_id uuid not null references public.musicas(id) on delete cascade,
  ordem int not null default 0,
  tom text,
  observacao text,
  unique (evento_id, org_id, musica_id)
);
create index repertorio_evento_idx on public.repertorio(evento_id, ordem);

-- Quem edita a liturgia: pastores, secretaria e admin
create or replace function public.edito_liturgia() returns boolean
language sql stable security definer set search_path = public as $$
  select public.sou_pastor() or public.sou_secretaria()
$$;

-- Quem cadastra músicas: quem gere algum ministério com repertório
create or replace function public.gero_repertorio() returns boolean
language sql stable security definer set search_path = public as $$
  select public.sou_admin() or exists (select 1 from public.org o where o.tem_repertorio and o.ativo and public.gerencio_org(o.id))
$$;

alter table public.liturgia_itens enable row level security;
alter table public.musicas enable row level security;
alter table public.repertorio enable row level security;

create policy liturgia_ler on public.liturgia_itens for select to authenticated
  using (exists (select 1 from public.eventos e where e.id = evento_id));
create policy liturgia_gerir on public.liturgia_itens for all to authenticated
  using ((select public.edito_liturgia())) with check ((select public.edito_liturgia()));

create policy musicas_ler on public.musicas for select to authenticated
  using (unidade_id = (select public.minha_unidade()));
create policy musicas_gerir on public.musicas for all to authenticated
  using ((select public.gero_repertorio()) and unidade_id = (select public.minha_unidade()))
  with check ((select public.gero_repertorio()) and unidade_id = (select public.minha_unidade()));

create policy repertorio_ler on public.repertorio for select to authenticated
  using (exists (select 1 from public.eventos e where e.id = evento_id));
create policy repertorio_gerir on public.repertorio for all to authenticated
  using (public.gerencio_org(org_id)) with check (public.gerencio_org(org_id));

-- Copia a liturgia do último evento com o mesmo título (para não montar do zero toda semana)
create or replace function public.copiar_liturgia(p_evento uuid) returns int
language plpgsql security definer set search_path = public as $$
declare v_titulo text; v_inicio timestamptz; v_unidade uuid; v_origem uuid; v_n int;
begin
  if not public.edito_liturgia() then raise exception 'Somente pastores e secretaria editam a liturgia.'; end if;
  select titulo, inicio, unidade_id into v_titulo, v_inicio, v_unidade from public.eventos where id = p_evento;
  select e.id into v_origem from public.eventos e
  where e.unidade_id = v_unidade and e.titulo = v_titulo and e.id <> p_evento
    and exists (select 1 from public.liturgia_itens l where l.evento_id = e.id)
  order by abs(extract(epoch from e.inicio - v_inicio)) limit 1;
  if v_origem is null then raise exception 'Nenhuma liturgia anterior deste mesmo culto para copiar.'; end if;
  delete from public.liturgia_itens where evento_id = p_evento;
  insert into public.liturgia_itens (evento_id, ordem, titulo, org_id, funcao_id, responsavel_texto, horario, observacao)
  select p_evento, ordem, titulo, org_id, funcao_id, responsavel_texto, horario, observacao
  from public.liturgia_itens where evento_id = v_origem;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- Define o banner do evento (opcionalmente para os próximos da mesma série)
create or replace function public.definir_banner(p_evento uuid, p_url text, p_serie boolean default false) returns int
language plpgsql security definer set search_path = public as $$
declare e public.eventos; v_n int;
begin
  select * into e from public.eventos where id = p_evento;
  if not found then raise exception 'Evento não encontrado.'; end if;
  if not (public.sou_pastor() or public.sou_secretaria() or (e.org_id is not null and public.gerencio_org(e.org_id))) then
    raise exception 'Sem permissão para alterar o banner.';
  end if;
  update public.eventos set banner_url = nullif(p_url, '')
  where id = p_evento or (p_serie and e.serie_id is not null and serie_id = e.serie_id and inicio >= e.inicio);
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- equipes_do_culto passa a devolver também a função (id) para ligar com a liturgia
drop function if exists public.equipes_do_culto(uuid);
create function public.equipes_do_culto(p_evento uuid)
returns table (escala_id uuid, org_id uuid, org_nome text, publicada boolean, alocacao_id uuid, pessoa_id uuid,
               nome text, funcao_id uuid, funcao text, funcao_ordem int, status text, motivo text, ve_status boolean)
language sql stable security definer set search_path = public as $$
  select s.id, s.org_id, o.nome, s.publicada, al.id, al.pessoa_id, p.nome, f.id, f.nome, coalesce(f.ordem, 99),
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

revoke execute on function public.equipes_do_culto(uuid), public.copiar_liturgia(uuid), public.definir_banner(uuid, text, boolean),
  public.edito_liturgia(), public.gero_repertorio() from public, anon;
grant execute on function public.equipes_do_culto(uuid), public.copiar_liturgia(uuid), public.definir_banner(uuid, text, boolean),
  public.edito_liturgia(), public.gero_repertorio() to authenticated;
