-- UNIDA ONE — dados iniciais: Sede, estrutura dos 4 pilares, cultos fixos e administrador.
do $$
declare
  v_un uuid; v_igreja uuid; v_pastoral uuid; v_min uuid; v_ebd uuid; v_gp uuid;
  v_ger uuid; v_cul uuid; v_apo uuid; v_rafa uuid;
  d date; v_serie_dom1 uuid := gen_random_uuid(); v_serie_dom2 uuid := gen_random_uuid();
  v_serie_ter uuid := gen_random_uuid(); v_serie_qui uuid := gen_random_uuid(); v_serie_ebd uuid := gen_random_uuid();
  t timestamptz;
begin
  insert into public.config (chave, valor) values ('app_url', 'https://one.unidadagraca.com.br')
  on conflict (chave) do nothing;

  insert into public.unidades (nome, cidade) values ('Sede', 'Santo André - SP') returning id into v_un;

  insert into public.org (unidade_id, tipo, nome) values (v_un, 'igreja', 'Igreja Unida da Graça') returning id into v_igreja;
  insert into public.org (unidade_id, parent_id, tipo, nome, ordem) values (v_un, v_igreja, 'pilar', 'Pastoral', 1) returning id into v_pastoral;
  insert into public.org (unidade_id, parent_id, tipo, nome, ordem) values (v_un, v_igreja, 'pilar', 'Ministerial', 2) returning id into v_min;
  insert into public.org (unidade_id, parent_id, tipo, nome, ordem) values (v_un, v_igreja, 'pilar', 'Escola Bíblica', 3) returning id into v_ebd;
  insert into public.org (unidade_id, parent_id, tipo, nome, ordem) values (v_un, v_igreja, 'pilar', 'Grupos Pequenos', 4) returning id into v_gp;

  insert into public.org (unidade_id, parent_id, tipo, nome, ordem) values (v_un, v_min, 'setor', 'Geracional', 1) returning id into v_ger;
  insert into public.org (unidade_id, parent_id, tipo, nome, ordem) values (v_un, v_min, 'setor', 'Cúltico', 2) returning id into v_cul;
  insert into public.org (unidade_id, parent_id, tipo, nome, ordem) values (v_un, v_min, 'setor', 'Apoio e Ação', 3) returning id into v_apo;

  insert into public.org (unidade_id, parent_id, tipo, nome, ordem)
  select v_un, v_ger, 'ministerio', n, o from unnest(array['Kids','Teens','Young','Família']) with ordinality as x(n, o);
  insert into public.org (unidade_id, parent_id, tipo, nome, ordem)
  select v_un, v_cul, 'ministerio', n, o from unnest(array['Louvor','Intercessão','Diaconia','Welcome','Multimídia','Dança','Teatro']) with ordinality as x(n, o);
  insert into public.org (unidade_id, parent_id, tipo, nome, ordem)
  select v_un, v_apo, 'ministerio', n, o from unnest(array['Dorcas','Levitas','Em Ação','Comunicação']) with ordinality as x(n, o);

  -- Escala pastoral do culto (pregação, abertura, oferta, oração)
  insert into public.funcoes (org_id, nome, ordem)
  select v_pastoral, n, o from unnest(array['Pregação','Abertura','Oferta','Oração']) with ordinality as x(n, o);
  -- Professores da EBD
  insert into public.funcoes (org_id, nome, ordem) values (v_ebd, 'Professor', 1), (v_ebd, 'Auxiliar', 2);

  -- Cultos fixos até o fim de 2027 (duração padrão: cultos 2h, EBD 1h30 — ajustável)
  d := date '2026-11-08';
  while d <= date '2027-12-31' loop
    if extract(dow from d) = 0 then
      t := (d + time '08:30') at time zone 'America/Sao_Paulo';
      insert into public.eventos (unidade_id, serie_id, tipo, titulo, local, inicio, fim) values (v_un, v_serie_ebd, 'ebd', 'Escola Bíblica Dominical', 'Sede', t, t + interval '90 minutes');
      t := (d + time '10:30') at time zone 'America/Sao_Paulo';
      insert into public.eventos (unidade_id, serie_id, tipo, titulo, local, inicio, fim) values (v_un, v_serie_dom1, 'culto', 'Culto de Domingo — Manhã', 'Sede', t, t + interval '2 hours');
      t := (d + time '18:30') at time zone 'America/Sao_Paulo';
      insert into public.eventos (unidade_id, serie_id, tipo, titulo, local, inicio, fim) values (v_un, v_serie_dom2, 'culto', 'Culto de Domingo — Noite', 'Sede', t, t + interval '2 hours');
    elsif extract(dow from d) = 2 then
      t := (d + time '14:00') at time zone 'America/Sao_Paulo';
      insert into public.eventos (unidade_id, serie_id, tipo, titulo, local, inicio, fim) values (v_un, v_serie_ter, 'culto', 'Tarde da Bênção', 'Sede', t, t + interval '2 hours');
    elsif extract(dow from d) = 4 then
      t := (d + time '20:00') at time zone 'America/Sao_Paulo';
      insert into public.eventos (unidade_id, serie_id, tipo, titulo, local, inicio, fim) values (v_un, v_serie_qui, 'culto', 'Culto de Quinta', 'Sede', t, t + interval '2 hours');
    end if;
    d := d + 1;
  end loop;

  -- Administrador do sistema
  insert into public.pessoas (unidade_id, nome, telefone, email, is_admin)
  values (v_un, 'Rafael Ribeiro', '5511940297986', 'contato.ribeirorafael@gmail.com', true) returning id into v_rafa;
  insert into public.convites (pessoa_id) values (v_rafa);
end $$;
