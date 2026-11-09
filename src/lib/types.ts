export type OrgTipo = 'igreja' | 'pilar' | 'setor' | 'ministerio' | 'equipe' | 'curso' | 'turma' | 'gp'
export type Papel = 'pastor' | 'secretaria' | 'coordenador' | 'supervisor' | 'lider' | 'membro'
export type EventoTipo = 'culto' | 'ebd' | 'curso' | 'ensaio' | 'reuniao' | 'gp' | 'evento' | 'pastoral'
export type AlocStatus = 'pendente' | 'confirmada' | 'recusada'

export interface Org { id: string; unidade_id: string; parent_id: string | null; tipo: OrgTipo; nome: string; descricao: string | null; ordem: number; ativo: boolean; tem_repertorio?: boolean }
export interface Pessoa { id: string; unidade_id: string; user_id: string | null; nome: string; telefone: string | null; email: string | null; is_admin: boolean; ativo: boolean }
export interface Vinculo { id: string; pessoa_id: string; org_id: string; papel: Papel; funcao_ids: string[]; ativo: boolean }
export interface Funcao { id: string; org_id: string; nome: string; ordem: number }
export interface Evento { id: string; unidade_id: string; org_id: string | null; serie_id: string | null; tipo: EventoTipo; titulo: string; descricao: string | null; local: string | null; inicio: string; fim: string; cancelado: boolean }
export interface Escala { id: string; evento_id: string; org_id: string; publicada: boolean; publicada_em: string | null; observacao: string | null }
export interface Alocacao { id: string; escala_id: string; pessoa_id: string; funcao_id: string | null; status: AlocStatus; motivo: string | null; criado_em: string; notificado_em: string | null }
export interface Indisponibilidade { id: string; pessoa_id: string; inicio: string; fim: string; motivo: string | null }
export interface Solicitacao { id: string; tipo: 'convite' | 'evento_criar' | 'evento_alterar' | 'evento_cancelar' | 'troca'; status: 'pendente' | 'aprovada' | 'recusada' | 'cancelada'; solicitante_id: string | null; org_id: string | null; evento_id: string | null; alocacao_id: string | null; dados: Record<string, any>; resposta: string | null; criado_em: string; decidido_em: string | null }
export interface Notificacao { id: string; titulo: string; mensagem: string; link: string | null; lida: boolean; criado_em: string }
export interface Conflito { pessoa_id: string; origem: 'escala' | 'indisponivel'; descricao: string; inicio: string; fim: string; criado_em: string }

export const PAPEL_LABEL: Record<Papel, string> = {
  pastor: 'Pastor(a)', secretaria: 'Secretaria', coordenador: 'Coordenador(a)', supervisor: 'Supervisor(a)', lider: 'Líder', membro: 'Membro',
}
export const TIPO_EVENTO_LABEL: Record<EventoTipo, string> = {
  culto: 'Culto', ebd: 'EBD', curso: 'Curso', ensaio: 'Ensaio', reuniao: 'Reunião', gp: 'GP', evento: 'Evento', pastoral: 'Pastoral',
}
export const ORG_TIPO_LABEL: Record<OrgTipo, string> = {
  igreja: 'Igreja', pilar: 'Pilar', setor: 'Setor', ministerio: 'Ministério', equipe: 'Equipe', curso: 'Curso', turma: 'Turma', gp: 'GP',
}
