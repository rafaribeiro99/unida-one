# UNIDA ONE

Plataforma interna da Igreja Batista Unida da Graça para quem serve: ministérios, pessoas, eventos, escalas, confirmações, conflitos e aprovações.

**Stack:** React + Vite + TypeScript + Tailwind (PWA) · Supabase (Postgres, Auth, RLS, Edge Functions) · Cloudflare Pages · WhatsApp via Evolution API.

## Estrutura

```
src/                      app (PWA)
  pages/                  telas
  components/             componentes compartilhados
  lib/                    supabase, autenticação/permissões, tipos, datas
supabase/migrations/      banco: tabelas, permissões (RLS), regras de negócio, dados iniciais
supabase/functions/       ativar-convite (cria o login a partir do link) · whatsapp (envia a fila)
```

## Regras principais

- **Papéis** (por item da estrutura, herdados para baixo): coordenador, supervisor, líder, membro, pastor, secretaria. `is_admin` faz tudo.
- **Escalas:** líder, supervisor e coordenador montam e publicam. Ao publicar, cada pessoa recebe WhatsApp com link de confirmação em um toque (`/r/:token`, sem login).
- **Conflitos:** alerta (não bloqueia). Quem foi escalado **primeiro** tem prioridade; a escala feita depois fica em vermelho. Indisponibilidades também geram alerta.
- **Aprovações:**
  - Inclusão de pessoa pedida pelo líder → aprovada pelo supervisor/coordenador.
  - Evento geral pedido por líder → aprovado pela secretaria ou supervisor. Ensaios e reuniões do próprio ministério não precisam de aprovação.
  - Troca pedida pelo liderado → aprovada pelo líder.
- **Pastoral:** eventos do tipo pastoral só são vistos por pastores.

## Rodar localmente

```bash
cp .env.example .env.local   # preencha URL e chave pública do Supabase
npm install
npm run dev
```

## Deploy (Cloudflare Pages)

1. Cloudflare → Workers & Pages → Create → Pages → Connect to Git → `rafaribeiro99/unida-one`.
2. Build command: `npm run build` · Output directory: `dist`.
3. Variáveis de ambiente: não precisa — as chaves públicas estão em `.env.production`.
4. Custom domains → `one.unidadagraca.com.br`.

## Supabase

- Auth → URL Configuration: Site URL `https://one.unidadagraca.com.br`; Redirect URLs `https://one.unidadagraca.com.br/**` e `http://localhost:5173/**`.
- Secrets das funções (WhatsApp): `EVOLUTION_URL`, `EVOLUTION_INSTANCE`, `EVOLUTION_APIKEY` (e `EVOLUTION_V1=1` se a Evolution for v1).
