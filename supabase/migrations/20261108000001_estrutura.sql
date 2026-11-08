-- UNIDA ONE — estrutura base
-- Núcleo: unidades (igrejas/campus), pessoas, árvore organizacional, funções, vínculos,
-- eventos, escalas, alocações, indisponibilidades, solicitações (aprovações), convites, notificações.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------
create type public.org_tipo as enum ('igreja','pilar','setor','ministerio','equipe','curso','turma','gp');
create type public.papel_tipo as enum ('pastor','secretaria','coordenador','supervisor','lider','membro');
create type public.evento_tipo as enum ('culto','ebd','curso','ensaio','reuniao','gp','evento','pastoral');
create type public.aloc_status as enum ('pendente','confirmada','recusada');
create type public.sol_tipo as enum ('convite','evento_criar','evento_alterar','evento_cancelar','troca');
create type public.sol_status as enum ('pendente','aprovada','recusada','cancelada');

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------
create table public.config (
  chave text primary key,
  valor text not null
);

create table public.unidades (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cidade text,
  criado_em timestamptz not null default now()
);

create table public.pessoas (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid not null references public.unidades(id),
  user_id uuid unique references auth.users(id) on delete set null,
  nome text not null,
  telefone text,           -- somente dígitos, com DDI (ex.: 5511999999999)
  email text,
  is_admin boolean not null default false,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
create index pessoas_unidade_idx on public.pessoas(unidade_id);
create index pessoas_telefone_idx on public.pessoas(telefone);

create table public.org (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid not null references public.unidades(id),
  parent_id uuid references public.org(id) on delete cascade,
  tipo public.org_tipo not null,
  nome text not null,
  descricao text,
  ordem int not null default 0,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
create index org_parent_idx on public.org(parent_id);

create table public.funcoes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.org(id) on delete cascade,
  nome text not null,
  ordem int not null default 0,
  unique (org_id, nome)
);

create table public.vinculos (
  id uuid primary key default gen_random_uuid(),
  pessoa_id uuid not null references public.pessoas(id) on delete cascade,
  org_id uuid not null references public.org(id) on delete cascade,
  papel public.papel_tipo not null default 'membro',
  funcao_ids uuid[] not null default '{}',
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  unique (pessoa_id, org_id, papel)
);
create index vinculos_org_idx on public.vinculos(org_id);
create index vinculos_pessoa_idx on public.vinculos(pessoa_id);

create table public.eventos (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid not null references public.unidades(id),
  org_id uuid references public.org(id) on delete set null,  -- dono do evento; null = agenda geral da igreja
  serie_id uuid,
  tipo public.evento_tipo not null default 'evento',
  titulo text not null,
  descricao text,
  local text,
  inicio timestamptz not null,
  fim timestamptz not null,
  cancelado boolean not null default false,
  criado_por uuid references public.pessoas(id) on delete set null,
  criado_em timestamptz not null default now(),
  check (fim > inicio)
);
create index eventos_inicio_idx on public.eventos(unidade_id, inicio);
create index eventos_serie_idx on public.eventos(serie_id);

create table public.escalas (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid not null references public.eventos(id) on delete cascade,
  org_id uuid not null references public.org(id) on delete cascade,
  publicada boolean not null default false,
  publicada_em timestamptz,
  observacao text,
  criado_por uuid references public.pessoas(id) on delete set null,
  criado_em timestamptz not null default now(),
  unique (evento_id, org_id)
);
create index escalas_org_idx on public.escalas(org_id);

create table public.alocacoes (
  id uuid primary key default gen_random_uuid(),
  escala_id uuid not null references public.escalas(id) on delete cascade,
  pessoa_id uuid not null references public.pessoas(id) on delete cascade,
  funcao_id uuid references public.funcoes(id) on delete set null,
  status public.aloc_status not null default 'pendente',
  motivo text,
  respondida_em timestamptz,
  notificado_em timestamptz,
  token text not null unique default encode(extensions.gen_random_bytes(16), 'hex'),
  criado_por uuid references public.pessoas(id) on delete set null,
  criado_em timestamptz not null default now()
);
create index alocacoes_escala_idx on public.alocacoes(escala_id);
create index alocacoes_pessoa_idx on public.alocacoes(pessoa_id);

create table public.indisponibilidades (
  id uuid primary key default gen_random_uuid(),
  pessoa_id uuid not null references public.pessoas(id) on delete cascade,
  inicio timestamptz not null,
  fim timestamptz not null,
  motivo text,
  criado_em timestamptz not null default now(),
  check (fim > inicio)
);
create index indisp_pessoa_idx on public.indisponibilidades(pessoa_id, inicio);

create table public.solicitacoes (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid not null references public.unidades(id),
  tipo public.sol_tipo not null,
  status public.sol_status not null default 'pendente',
  solicitante_id uuid references public.pessoas(id) on delete set null,
  org_id uuid references public.org(id) on delete cascade,
  evento_id uuid references public.eventos(id) on delete cascade,
  alocacao_id uuid references public.alocacoes(id) on delete cascade,
  dados jsonb not null default '{}',
  decidido_por uuid references public.pessoas(id) on delete set null,
  decidido_em timestamptz,
  resposta text,
  criado_em timestamptz not null default now()
);
create index solicitacoes_status_idx on public.solicitacoes(unidade_id, status);

create table public.convites (
  token text primary key default encode(extensions.gen_random_bytes(18), 'hex'),
  pessoa_id uuid not null references public.pessoas(id) on delete cascade,
  criado_em timestamptz not null default now(),
  expira_em timestamptz not null default now() + interval '30 days',
  usado_em timestamptz
);

create table public.notificacoes (
  id uuid primary key default gen_random_uuid(),
  pessoa_id uuid not null references public.pessoas(id) on delete cascade,
  titulo text not null,
  mensagem text not null,
  link text,
  whatsapp_status text not null default 'pendente', -- pendente | enviada | erro | sem_telefone
  erro text,
  tentativas int not null default 0,
  lida boolean not null default false,
  criado_em timestamptz not null default now(),
  enviado_em timestamptz
);
create index notificacoes_pessoa_idx on public.notificacoes(pessoa_id, criado_em desc);
create index notificacoes_fila_idx on public.notificacoes(whatsapp_status) where whatsapp_status = 'pendente';
