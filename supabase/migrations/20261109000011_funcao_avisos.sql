-- Programação padrão dos cultos: Abertura → Dízimos e Ofertas → Avisos → Mensagem
insert into public.funcoes (org_id, nome, ordem)
select o.id, 'Avisos', 3 from public.org o
where o.tipo = 'pilar' and o.nome = 'Pastoral'
on conflict (org_id, nome) do nothing;

update public.funcoes f set ordem = case f.nome when 'Abertura' then 1 when 'Oferta' then 2 when 'Avisos' then 3 when 'Pregação' then 4 when 'Oração' then 5 else f.ordem end
from public.org o where o.id = f.org_id and o.tipo = 'pilar' and o.nome = 'Pastoral';
