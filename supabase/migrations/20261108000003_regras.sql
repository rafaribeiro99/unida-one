-- UNIDA ONE — regras de negócio (funções RPC)
-- Convites com aprovação do supervisor, eventos com aprovação da secretaria/supervisor,
-- trocas com aprovação do líder, confirmação de escala, conflitos e notificações.

-- ---------------------------------------------------------------------------
-- Utilitários
-- ---------------------------------------------------------------------------
create or replace function public.app_url() returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select valor from public.config where chave = 'app_url'), 'https://one.unidadagraca.com.br')
$$;

create or replace function public.fmt_data(p timestamptz) returns text
language sql immutable as $$
  select (array['dom','seg','ter','qua','qui','sex','sáb'])[extract(dow from p at time zone 'America/Sao_Paulo')::int + 1]
    || ', ' || to_char(p at time zone 'America/Sao_Paulo', 'DD/MM "às" HH24:MI')
$$;

create or replace function public.so_digitos(p text) returns text
language sql immutable as $$
  select case
    when p is null or regexp_replace(p, '\D', '', 'g') = '' then null
    when length(regexp_replace(p, '\D', '', 'g')) <= 11 then '55' || regexp_replace(p, '\D', '', 'g')
    else regexp_replace(p, '\D', '', 'g') end
$$;

create or replace function public.notificar(p_pessoa uuid, p_titulo text, p_mensagem text, p_link text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_tel text;
begin
  select telefone into v_tel from public.pessoas where id = p_pessoa and ativo;
  if not found then return; end if;
  insert into public.notificacoes (pessoa_id, titulo, mensagem, link, whatsapp_status)
  values (p_pessoa, p_titulo, p_mensagem, p_link, case when v_tel is null then 'sem_telefone' else 'pendente' end);
end $$;

-- Quem pode decidir uma solicitação (para avisar)
create or replace function public.aprovadores(p_sol public.solicitacoes) returns setof uuid
language sql stable security definer set search_path = public as $$
  select distinct p.id from public.pessoas p
  where p.ativo and p.unidade_id = p_sol.unidade_id and p.id is distinct from p_sol.solicitante_id and (
    p.is_admin and not exists (  -- admin só é avisado se não houver outro aprovador
      select 1 from public.vinculos v where v.ativo and v.pessoa_id <> coalesce(p_sol.solicitante_id, '00000000-0000-0000-0000-000000000000')
        and ((p_sol.org_id is not null and v.org_id in (select public.org_ancestrais(p_sol.org_id))
              and v.papel = any(case p_sol.tipo when 'troca' then array['coordenador','supervisor','lider']::public.papel_tipo[]
                                                else array['coordenador','supervisor']::public.papel_tipo[] end))
          or (p_sol.tipo in ('evento_criar','evento_alterar','evento_cancelar') and v.papel = 'secretaria')))
    or exists (
      select 1 from public.vinculos v where v.pessoa_id = p.id and v.ativo
        and ((p_sol.org_id is not null and v.org_id in (select public.org_ancestrais(p_sol.org_id))
              and v.papel = any(case p_sol.tipo when 'troca' then array['coordenador','supervisor','lider']::public.papel_tipo[]
                                                else array['coordenador','supervisor']::public.papel_tipo[] end))
          or (p_sol.tipo in ('evento_criar','evento_alterar','evento_cancelar') and v.papel = 'secretaria')))
  )
$$;

create or replace function public.avisar_aprovadores(p_sol uuid) returns void
language plpgsql security definer set search_path = public as $$
declare s public.solicitacoes; v_quem text; v_txt text; a uuid;
begin
  select * into s from public.solicitacoes where id = p_sol;
  select nome into v_quem from public.pessoas where id = s.solicitante_id;
  v_txt := case s.tipo
    when 'convite' then v_quem || ' pediu para incluir ' || coalesce(s.dados->>'nome','uma pessoa') || ' em ' || coalesce((select nome from public.org where id = s.org_id), 'um ministério') || '.'
    when 'troca' then v_quem || ' pediu troca na escala: ' || coalesce(s.dados->>'resumo','') || '.'
    when 'evento_criar' then v_quem || ' pediu um novo evento: ' || coalesce(s.dados->>'titulo','') || '.'
    when 'evento_alterar' then v_quem || ' pediu alteração do evento ' || coalesce(s.dados->>'titulo','') || '.'
    else v_quem || ' pediu o cancelamento do evento ' || coalesce(s.dados->>'titulo','') || '.' end;
  for a in select public.aprovadores(s) loop
    perform public.notificar(a, 'Aprovação pendente', v_txt || E'\nAprove ou recuse: ' || public.app_url() || '/aprovacoes', '/aprovacoes');
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Convites (inclusão de pessoas em ministérios)
-- ---------------------------------------------------------------------------
create or replace function public.executar_convite(p_org uuid, p_dados jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_unidade uuid; v_pessoa uuid; v_tel text := public.so_digitos(p_dados->>'telefone');
  v_email text := nullif(lower(trim(p_dados->>'email')), ''); v_token text; v_user uuid; v_org_nome text;
  v_funcoes uuid[] := coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(coalesce(p_dados->'funcao_ids','[]')) x), '{}');
  v_papel public.papel_tipo := coalesce(nullif(p_dados->>'papel',''), 'membro')::public.papel_tipo;
begin
  select unidade_id, nome into v_unidade, v_org_nome from public.org where id = p_org;
  -- reaproveita pessoa existente (mesmo id informado, mesmo e-mail ou mesmo telefone)
  select id, user_id into v_pessoa, v_user from public.pessoas
   where unidade_id = v_unidade and (
     id = nullif(p_dados->>'pessoa_id','')::uuid
     or (v_email is not null and lower(email) = v_email)
     or (v_tel is not null and telefone = v_tel and lower(nome) = lower(trim(p_dados->>'nome'))))
   order by (id = nullif(p_dados->>'pessoa_id','')::uuid) desc nulls last
   limit 1;
  if v_pessoa is null then
    insert into public.pessoas (unidade_id, nome, telefone, email)
    values (v_unidade, trim(p_dados->>'nome'), v_tel, v_email) returning id into v_pessoa;
  end if;
  insert into public.vinculos (pessoa_id, org_id, papel, funcao_ids)
  values (v_pessoa, p_org, v_papel, v_funcoes)
  on conflict (pessoa_id, org_id, papel) do update set ativo = true, funcao_ids = excluded.funcao_ids;

  if v_user is null then
    select token into v_token from public.convites where pessoa_id = v_pessoa and usado_em is null and expira_em > now() limit 1;
    if v_token is null then
      insert into public.convites (pessoa_id) values (v_pessoa) returning token into v_token;
    end if;
    perform public.notificar(v_pessoa, 'Bem-vindo(a) ao UNIDA ONE',
      'Olá, ' || split_part(trim(p_dados->>'nome'), ' ', 1) || '! Você foi incluído(a) em *' || v_org_nome
      || '* no UNIDA ONE, o app de escalas da Unida da Graça.' || E'\nCrie seu acesso: ' || public.app_url() || '/convite/' || v_token,
      '/convite/' || v_token);
  else
    perform public.notificar(v_pessoa, 'Novo ministério', 'Você foi incluído(a) em *' || v_org_nome || '* no UNIDA ONE.', '/');
  end if;
  return jsonb_build_object('pessoa_id', v_pessoa, 'token', v_token);
end $$;

create or replace function public.convidar_pessoa(p_org uuid, p_nome text, p_telefone text, p_email text default null,
  p_papel public.papel_tipo default 'membro', p_funcao_ids uuid[] default '{}', p_pessoa_id uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_dados jsonb; v_sol uuid; v_res jsonb;
begin
  if not public.gerencio_org(p_org) then raise exception 'Você não lidera este ministério.'; end if;
  if coalesce(trim(p_nome), '') = '' and p_pessoa_id is null then raise exception 'Informe o nome.'; end if;
  if p_pessoa_id is not null then select nome, telefone, email into p_nome, p_telefone, p_email from public.pessoas where id = p_pessoa_id; end if;
  v_dados := jsonb_build_object('nome', trim(p_nome), 'telefone', p_telefone, 'email', p_email, 'papel', p_papel,
    'funcao_ids', to_jsonb(p_funcao_ids), 'pessoa_id', p_pessoa_id);
  if public.supervisiono_org(p_org) then
    v_res := public.executar_convite(p_org, v_dados);
    return v_res || jsonb_build_object('status', 'aprovado');
  end if;
  if p_papel <> 'membro' then raise exception 'Somente supervisores podem definir líderes.'; end if;
  insert into public.solicitacoes (unidade_id, tipo, solicitante_id, org_id, dados)
  values ((select unidade_id from public.org where id = p_org), 'convite', public.minha_pessoa(), p_org, v_dados)
  returning id into v_sol;
  perform public.avisar_aprovadores(v_sol);
  return jsonb_build_object('status', 'pendente', 'solicitacao_id', v_sol);
end $$;

create or replace function public.novo_link_convite(p_pessoa uuid) returns text
language plpgsql security definer set search_path = public as $$
declare v_token text;
begin
  if not (public.sou_admin() or exists (select 1 from public.vinculos v where v.pessoa_id = p_pessoa and public.gerencio_org(v.org_id))) then
    raise exception 'Sem permissão.';
  end if;
  if exists (select 1 from public.pessoas where id = p_pessoa and user_id is not null) then
    raise exception 'Esta pessoa já tem acesso.';
  end if;
  update public.convites set expira_em = now() where pessoa_id = p_pessoa and usado_em is null;
  insert into public.convites (pessoa_id) values (p_pessoa) returning token into v_token;
  return v_token;
end $$;

-- Usada pela página pública de convite (sem login)
create or replace function public.info_convite(p_token text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('nome', p.nome, 'email', p.email, 'valido', c.usado_em is null and c.expira_em > now())
  from public.convites c join public.pessoas p on p.id = c.pessoa_id where c.token = p_token
$$;

-- Usada somente pela função de servidor (service role) ao ativar o acesso
create or replace function public.vincular_convite(p_token text, p_user uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_pessoa uuid;
begin
  select pessoa_id into v_pessoa from public.convites where token = p_token and usado_em is null and expira_em > now();
  if v_pessoa is null then raise exception 'Convite inválido ou expirado.'; end if;
  update public.pessoas set user_id = p_user where id = v_pessoa;
  update public.convites set usado_em = now() where token = p_token;
  return v_pessoa;
end $$;

-- ---------------------------------------------------------------------------
-- Eventos
-- ---------------------------------------------------------------------------
create or replace function public.executar_evento(p_acao text, p_evento uuid, p_dados jsonb, p_autor uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  e public.eventos; v_inicio timestamptz; v_fim timestamptz; v_ate date; v_serie uuid; v_n int := 0; v_dur interval;
  a record; v_ids uuid[];
begin
  if p_acao = 'criar' then
    v_inicio := (p_dados->>'inicio')::timestamptz; v_fim := (p_dados->>'fim')::timestamptz; v_dur := v_fim - v_inicio;
    v_ate := nullif(p_dados->>'repetir_ate','')::date;
    v_serie := case when v_ate is not null then gen_random_uuid() end;
    loop
      insert into public.eventos (unidade_id, org_id, serie_id, tipo, titulo, descricao, local, inicio, fim, criado_por)
      values (coalesce(nullif(p_dados->>'unidade_id','')::uuid, (select unidade_id from public.pessoas where id = p_autor)),
              nullif(p_dados->>'org_id','')::uuid, v_serie, coalesce(nullif(p_dados->>'tipo',''),'evento')::public.evento_tipo,
              p_dados->>'titulo', nullif(p_dados->>'descricao',''), nullif(p_dados->>'local',''), v_inicio, v_inicio + v_dur, p_autor);
      v_n := v_n + 1;
      v_inicio := v_inicio + interval '7 days';
      exit when v_ate is null or (v_inicio at time zone 'America/Sao_Paulo')::date > v_ate or v_n >= 260;
    end loop;
    return jsonb_build_object('criados', v_n);
  end if;

  select * into e from public.eventos where id = p_evento;
  if not found then raise exception 'Evento não encontrado.'; end if;

  if p_acao = 'alterar' then
    update public.eventos set
      titulo = coalesce(nullif(p_dados->>'titulo',''), titulo),
      tipo = coalesce(nullif(p_dados->>'tipo','')::public.evento_tipo, tipo),
      descricao = case when p_dados ? 'descricao' then nullif(p_dados->>'descricao','') else descricao end,
      local = case when p_dados ? 'local' then nullif(p_dados->>'local','') else local end,
      inicio = coalesce((p_dados->>'inicio')::timestamptz, inicio),
      fim = coalesce((p_dados->>'fim')::timestamptz, fim)
    where id = p_evento;
    for a in select distinct al.pessoa_id from public.alocacoes al join public.escalas s on s.id = al.escala_id
             where s.evento_id = p_evento and s.publicada and al.status <> 'recusada' loop
      perform public.notificar(a.pessoa_id, 'Evento alterado',
        'O evento *' || e.titulo || '* em que você está escalado(a) foi alterado. Novo horário: '
        || public.fmt_data(coalesce((p_dados->>'inicio')::timestamptz, e.inicio)) || '.', '/');
    end loop;
    return jsonb_build_object('alterados', 1);
  end if;

  if p_acao = 'cancelar' then
    if coalesce((p_dados->>'serie')::boolean, false) and e.serie_id is not null then
      select array_agg(id) into v_ids from public.eventos where serie_id = e.serie_id and inicio >= e.inicio and not cancelado;
    else
      v_ids := array[p_evento];
    end if;
    update public.eventos set cancelado = true where id = any(v_ids);
    for a in select distinct al.pessoa_id, ev.titulo, ev.inicio from public.alocacoes al
             join public.escalas s on s.id = al.escala_id join public.eventos ev on ev.id = s.evento_id
             where s.evento_id = any(v_ids) and s.publicada and al.status <> 'recusada' and ev.inicio > now() loop
      perform public.notificar(a.pessoa_id, 'Evento cancelado',
        'O evento *' || a.titulo || '* de ' || public.fmt_data(a.inicio) || ' foi cancelado. Você não precisa mais servir nele.', '/');
    end loop;
    return jsonb_build_object('cancelados', coalesce(array_length(v_ids,1),0));
  end if;

  raise exception 'Ação inválida.';
end $$;

-- Ponto único usado pelo app: executa direto se tiver permissão, senão vira pedido de aprovação.
create or replace function public.salvar_evento(p_acao text, p_evento uuid, p_dados jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare e public.eventos; v_org uuid; v_tipo public.evento_tipo; v_sol uuid; v_eu uuid := public.minha_pessoa();
begin
  if v_eu is null then raise exception 'Faça login.'; end if;
  if p_acao = 'criar' then
    v_org := nullif(p_dados->>'org_id','')::uuid;
    v_tipo := coalesce(nullif(p_dados->>'tipo',''),'evento')::public.evento_tipo;
    if coalesce(p_dados->>'titulo','') = '' then raise exception 'Informe o título.'; end if;
    if (p_dados->>'fim')::timestamptz <= (p_dados->>'inicio')::timestamptz then raise exception 'O fim precisa ser depois do início.'; end if;
  else
    select * into e from public.eventos where id = p_evento;
    if not found then raise exception 'Evento não encontrado.'; end if;
    v_org := e.org_id; v_tipo := e.tipo;
  end if;

  if public.posso_editar_evento_direto(v_org, v_tipo) then
    return public.executar_evento(p_acao, p_evento, p_dados, v_eu) || jsonb_build_object('status','aprovado');
  end if;
  if v_org is null or not public.gerencio_org(v_org) then
    raise exception 'Você não tem permissão para pedir este evento.';
  end if;
  insert into public.solicitacoes (unidade_id, tipo, solicitante_id, org_id, evento_id, dados)
  values (public.minha_unidade(), ('evento_' || p_acao)::public.sol_tipo, v_eu, v_org, p_evento,
          p_dados || jsonb_build_object('titulo', coalesce(p_dados->>'titulo', e.titulo)))
  returning id into v_sol;
  perform public.avisar_aprovadores(v_sol);
  return jsonb_build_object('status','pendente','solicitacao_id', v_sol);
end $$;

-- ---------------------------------------------------------------------------
-- Conflitos
-- ---------------------------------------------------------------------------
create or replace function public.conflitos_pessoas(p_pessoas uuid[], p_inicio timestamptz, p_fim timestamptz, p_ignorar_escala uuid default null)
returns table (pessoa_id uuid, origem text, descricao text, inicio timestamptz, fim timestamptz, criado_em timestamptz)
language sql stable security definer set search_path = public as $$
  select al.pessoa_id, 'escala',
         o.nome || ' · ' || case when ev.tipo = 'pastoral' and not public.sou_pastor() then 'Compromisso pastoral' else ev.titulo end
           || case when s.publicada then '' else ' (rascunho)' end,
         ev.inicio, ev.fim, al.criado_em
  from public.alocacoes al join public.escalas s on s.id = al.escala_id
  join public.eventos ev on ev.id = s.evento_id join public.org o on o.id = s.org_id
  where al.pessoa_id = any(p_pessoas) and al.status <> 'recusada' and not ev.cancelado
    and ev.inicio < p_fim and ev.fim > p_inicio and s.id is distinct from p_ignorar_escala
  union all
  select i.pessoa_id, 'indisponivel', 'Indisponível' || coalesce(': ' || i.motivo, ''), i.inicio, i.fim, i.criado_em
  from public.indisponibilidades i
  where i.pessoa_id = any(p_pessoas) and i.inicio < p_fim and i.fim > p_inicio
$$;

-- Conflitos de cada pessoa já escalada numa escala. "posterior" = esta alocação foi feita depois da outra (alerta vermelho).
create or replace function public.conflitos_escala(p_escala uuid)
returns table (alocacao_id uuid, pessoa_id uuid, origem text, descricao text, inicio timestamptz, fim timestamptz, posterior boolean)
language sql stable security definer set search_path = public as $$
  select al.id, c.pessoa_id, c.origem, c.descricao, c.inicio, c.fim, (c.origem = 'indisponivel' or al.criado_em > c.criado_em)
  from public.alocacoes al join public.escalas s on s.id = al.escala_id join public.eventos ev on ev.id = s.evento_id
  cross join lateral public.conflitos_pessoas(array[al.pessoa_id], ev.inicio, ev.fim, s.id) c
  where al.escala_id = p_escala and al.status <> 'recusada'
$$;

-- ---------------------------------------------------------------------------
-- Escalas: publicar e responder
-- ---------------------------------------------------------------------------
create or replace function public.publicar_escala(p_escala uuid) returns int
language plpgsql security definer set search_path = public as $$
declare s record; a record; v_n int := 0;
begin
  select es.*, ev.titulo, ev.inicio, ev.cancelado, o.nome as org_nome into s
  from public.escalas es join public.eventos ev on ev.id = es.evento_id join public.org o on o.id = es.org_id where es.id = p_escala;
  if not found or not public.gerencio_org(s.org_id) then raise exception 'Sem permissão.'; end if;
  if s.cancelado then raise exception 'Evento cancelado.'; end if;
  update public.escalas set publicada = true, publicada_em = coalesce(publicada_em, now()) where id = p_escala;
  for a in select al.id, al.token, al.pessoa_id, p.nome, f.nome as funcao from public.alocacoes al
           join public.pessoas p on p.id = al.pessoa_id left join public.funcoes f on f.id = al.funcao_id
           where al.escala_id = p_escala and al.notificado_em is null and al.status = 'pendente' loop
    perform public.notificar(a.pessoa_id, 'Nova escala',
      'Olá, ' || split_part(a.nome, ' ', 1) || '! Você foi escalado(a) em *' || s.org_nome || '*'
      || coalesce(' (' || a.funcao || ')', '') || ' para *' || s.titulo || '* — ' || public.fmt_data(s.inicio) || '.'
      || E'\nConfirme ou recuse: ' || public.app_url() || '/r/' || a.token,
      '/r/' || a.token);
    update public.alocacoes set notificado_em = now() where id = a.id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

create or replace function public.aplicar_resposta(p_aloc uuid, p_confirmar boolean, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare a record; l uuid;
begin
  update public.alocacoes set status = case when p_confirmar then 'confirmada' else 'recusada' end::public.aloc_status,
    motivo = case when p_confirmar then null else nullif(trim(p_motivo),'') end, respondida_em = now()
  where id = p_aloc;
  if not p_confirmar then
    select p.nome, ev.titulo, ev.inicio, s.org_id, o.nome as org_nome into a
    from public.alocacoes al join public.pessoas p on p.id = al.pessoa_id join public.escalas s on s.id = al.escala_id
    join public.eventos ev on ev.id = s.evento_id join public.org o on o.id = s.org_id where al.id = p_aloc;
    for l in select distinct v.pessoa_id from public.vinculos v
             where v.ativo and v.org_id = a.org_id and v.papel = 'lider' loop
      perform public.notificar(l, 'Escala recusada',
        a.nome || ' não poderá servir em *' || a.titulo || '* (' || public.fmt_data(a.inicio) || ')'
        || coalesce('. Motivo: ' || nullif(trim(p_motivo),''), '') || '. Escolha um substituto no app.', '/');
    end loop;
  end if;
end $$;

create or replace function public.responder_alocacao(p_alocacao uuid, p_confirmar boolean, p_motivo text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.alocacoes where id = p_alocacao and pessoa_id = public.minha_pessoa()) then
    raise exception 'Esta escala não é sua.';
  end if;
  perform public.aplicar_resposta(p_alocacao, p_confirmar, p_motivo);
end $$;

-- Confirmação em um toque pelo link do WhatsApp (sem login)
create or replace function public.info_alocacao_token(p_token text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('nome', split_part(p.nome,' ',1), 'ministerio', o.nome, 'funcao', f.nome,
    'evento', ev.titulo, 'inicio', ev.inicio, 'fim', ev.fim, 'local', ev.local, 'status', al.status,
    'cancelado', ev.cancelado, 'passado', ev.fim < now())
  from public.alocacoes al join public.pessoas p on p.id = al.pessoa_id join public.escalas s on s.id = al.escala_id
  join public.eventos ev on ev.id = s.evento_id join public.org o on o.id = s.org_id
  left join public.funcoes f on f.id = al.funcao_id
  where al.token = p_token and s.publicada
$$;

create or replace function public.responder_por_token(p_token text, p_confirmar boolean, p_motivo text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  select al.id into v_id from public.alocacoes al join public.escalas s on s.id = al.escala_id
  join public.eventos ev on ev.id = s.evento_id
  where al.token = p_token and s.publicada and not ev.cancelado and ev.fim > now();
  if v_id is null then raise exception 'Link inválido ou escala encerrada.'; end if;
  perform public.aplicar_resposta(v_id, p_confirmar, p_motivo);
  return public.info_alocacao_token(p_token);
end $$;

-- ---------------------------------------------------------------------------
-- Trocas
-- ---------------------------------------------------------------------------
create or replace function public.pedir_troca(p_alocacao uuid, p_motivo text, p_substituto uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare a record; v_sol uuid;
begin
  select al.*, s.org_id, ev.titulo, ev.inicio, ev.unidade_id into a from public.alocacoes al
  join public.escalas s on s.id = al.escala_id join public.eventos ev on ev.id = s.evento_id where al.id = p_alocacao;
  if not found or a.pessoa_id <> public.minha_pessoa() then raise exception 'Esta escala não é sua.'; end if;
  if exists (select 1 from public.solicitacoes where alocacao_id = p_alocacao and status = 'pendente') then
    raise exception 'Já existe um pedido de troca pendente para esta escala.';
  end if;
  insert into public.solicitacoes (unidade_id, tipo, solicitante_id, org_id, alocacao_id, dados)
  values (a.unidade_id, 'troca', a.pessoa_id, a.org_id, p_alocacao, jsonb_build_object(
    'motivo', p_motivo, 'substituto_id', p_substituto,
    'substituto_nome', (select nome from public.pessoas where id = p_substituto),
    'resumo', a.titulo || ' — ' || public.fmt_data(a.inicio)))
  returning id into v_sol;
  perform public.avisar_aprovadores(v_sol);
  return v_sol;
end $$;

-- ---------------------------------------------------------------------------
-- Decisão de solicitações
-- ---------------------------------------------------------------------------
create or replace function public.decidir_solicitacao(p_id uuid, p_aprovar boolean, p_resposta text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s public.solicitacoes; v_eu uuid := public.minha_pessoa(); v_res jsonb := '{}'; v_sub uuid; v_txt text;
begin
  select * into s from public.solicitacoes where id = p_id for update;
  if not found then raise exception 'Solicitação não encontrada.'; end if;
  if s.status <> 'pendente' then raise exception 'Esta solicitação já foi decidida.'; end if;
  if not public.posso_decidir(s) then raise exception 'Você não pode decidir esta solicitação.'; end if;

  if p_aprovar then
    if s.tipo = 'convite' then
      v_res := public.executar_convite(s.org_id, s.dados);
    elsif s.tipo in ('evento_criar','evento_alterar','evento_cancelar') then
      v_res := public.executar_evento(replace(s.tipo::text, 'evento_', ''), s.evento_id, s.dados, s.solicitante_id);
    elsif s.tipo = 'troca' then
      v_sub := nullif(s.dados->>'substituto_id','')::uuid;
      if v_sub is not null then
        update public.alocacoes set pessoa_id = v_sub, status = 'pendente', motivo = null, respondida_em = null,
          notificado_em = null, criado_em = now(), token = encode(extensions.gen_random_bytes(16), 'hex')
        where id = s.alocacao_id;
        perform public.publicar_escala_interno(s.alocacao_id);
      else
        update public.alocacoes set status = 'recusada', motivo = coalesce(s.dados->>'motivo', 'Troca aprovada'), respondida_em = now()
        where id = s.alocacao_id;
      end if;
    end if;
  end if;

  update public.solicitacoes set status = case when p_aprovar then 'aprovada' else 'recusada' end::public.sol_status,
    decidido_por = v_eu, decidido_em = now(), resposta = nullif(trim(p_resposta),'') where id = p_id;

  v_txt := case s.tipo
    when 'convite' then 'Inclusão de ' || coalesce(s.dados->>'nome','pessoa')
    when 'troca' then 'Troca em ' || coalesce(s.dados->>'resumo','escala')
    else 'Evento ' || coalesce(s.dados->>'titulo','') end;
  perform public.notificar(s.solicitante_id, case when p_aprovar then 'Pedido aprovado' else 'Pedido recusado' end,
    v_txt || case when p_aprovar then ': aprovado.' else ': recusado.' end || coalesce(' ' || nullif(trim(p_resposta),''), ''), '/aprovacoes');
  return v_res || jsonb_build_object('status', case when p_aprovar then 'aprovada' else 'recusada' end);
end $$;

-- Notifica uma alocação específica (usado na troca aprovada)
create or replace function public.publicar_escala_interno(p_alocacao uuid) returns void
language plpgsql security definer set search_path = public as $$
declare a record;
begin
  select al.id, al.token, al.pessoa_id, p.nome, f.nome as funcao, ev.titulo, ev.inicio, o.nome as org_nome, s.publicada into a
  from public.alocacoes al join public.pessoas p on p.id = al.pessoa_id join public.escalas s on s.id = al.escala_id
  join public.eventos ev on ev.id = s.evento_id join public.org o on o.id = s.org_id
  left join public.funcoes f on f.id = al.funcao_id where al.id = p_alocacao;
  if not a.publicada then return; end if;
  perform public.notificar(a.pessoa_id, 'Nova escala',
    'Olá, ' || split_part(a.nome, ' ', 1) || '! Você foi escalado(a) em *' || a.org_nome || '*'
    || coalesce(' (' || a.funcao || ')', '') || ' para *' || a.titulo || '* — ' || public.fmt_data(a.inicio) || '.'
    || E'\nConfirme ou recuse: ' || public.app_url() || '/r/' || a.token, '/r/' || a.token);
  update public.alocacoes set notificado_em = now() where id = p_alocacao;
end $$;

create or replace function public.cancelar_solicitacao(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.solicitacoes set status = 'cancelada', decidido_em = now()
  where id = p_id and solicitante_id = public.minha_pessoa() and status = 'pendente';
  if not found then raise exception 'Não foi possível cancelar.'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- Permissões de execução
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
grant execute on function public.info_convite(text), public.info_alocacao_token(text),
  public.responder_por_token(text, boolean, text), public.fmt_data(timestamptz) to anon;
-- funções internas: não expor ao app
revoke execute on function public.vincular_convite(text, uuid), public.executar_convite(uuid, jsonb),
  public.executar_evento(text, uuid, jsonb, uuid), public.notificar(uuid, text, text, text),
  public.aplicar_resposta(uuid, boolean, text), public.publicar_escala_interno(uuid),
  public.avisar_aprovadores(uuid) from authenticated;
grant execute on function public.vincular_convite(text, uuid) to service_role;
