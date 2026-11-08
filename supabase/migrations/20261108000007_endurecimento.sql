-- UNIDA ONE — ajustes do verificador de segurança do Supabase
-- Funções auxiliares usadas só dentro de outras funções: não ficam expostas na API.
revoke execute on function public.tem_papel_em(uuid, uuid, public.papel_tipo[]), public.org_ancestrais(uuid),
  public.aprovadores(public.solicitacoes), public.trg_pessoas_protecao(), public.trg_vinculos_protecao(),
  public.app_url() from authenticated, anon, public;
alter function public.so_digitos(text) set search_path = public;
alter function public.fmt_data(timestamptz) set search_path = public;
