import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bell, CalendarOff, LogOut, MessageCircle, Plus, Settings, Trash2 } from 'lucide-react'
import { addDays, format } from 'date-fns'
import { useAuth } from '../lib/auth'
import { useData, q } from '../lib/useData'
import { supabase, msgErro } from '../lib/supabase'
import { fmtDataCurta, fmtDiaHora } from '../lib/datas'
import { fmtTel } from '../lib/whats'
import { PAPEL_LABEL, type Indisponibilidade, type Notificacao, type Papel } from '../lib/types'
import { carregarMeusLideres } from '../lib/contatos'
import { linkWhats } from '../lib/whats'
import { Botao, Campo, Card, Entrada, Iniciais, Painel, Selo, useAviso } from '../components/ui'

export default function Perfil() {
  const { eu, vinculos, orgPorId, sair, admin, recarregar } = useAuth()
  const avisar = useAviso()
  const [editando, setEditando] = useState(false)
  const [nova, setNova] = useState(false)
  useEffect(() => { if (location.hash === '#folgas') setTimeout(() => document.getElementById('folgas')?.scrollIntoView({ behavior: 'smooth' }), 300) }, [])
  const { data, reload } = useData(async () => {
    const [ind, notif, lideres] = await Promise.all([
      q(supabase.from('indisponibilidades').select('*').eq('pessoa_id', eu!.id).gte('fim', new Date().toISOString()).order('inicio')),
      q(supabase.from('notificacoes').select('*').eq('pessoa_id', eu!.id).order('criado_em', { ascending: false }).limit(15)),
      carregarMeusLideres(),
    ])
    return { ind: ind as Indisponibilidade[], notif: notif as Notificacao[], lideres }
  }, [eu?.id])

  async function removerInd(i: Indisponibilidade) {
    const { error } = await supabase.from('indisponibilidades').delete().eq('id', i.id)
    if (error) return avisar(msgErro(error), 'erro')
    reload()
  }

  return (
    <div className="space-y-6">
      <Card className="p-5 flex items-center gap-4">
        <Iniciais nome={eu!.nome} className="h-14 w-14 text-lg" />
        <div className="flex-1 min-w-0">
          <p className="font-titulo font-semibold text-lg text-verde truncate">{eu!.nome}</p>
          <p className="text-sm text-grafite/60">{fmtTel(eu!.telefone)}</p>
          <p className="text-sm text-grafite/60 truncate">{eu!.email}</p>
        </div>
        <Botao variante="fantasma" className="h-9" onClick={() => setEditando(true)}>Editar</Botao>
      </Card>

      <section>
        <h2 className="text-sm font-semibold text-grafite/60 mb-2">Onde sirvo</h2>
        <Card className="p-4 flex flex-wrap gap-2">
          {vinculos.length === 0 ? <p className="text-sm text-grafite/50">Nenhum vínculo.</p> : vinculos.map((v) => (
            <Selo key={v.id} cor={v.papel === 'membro' ? 'cinza' : 'claro'}>{orgPorId.get(v.org_id)?.nome ?? '—'}{v.papel !== 'membro' ? ` · ${PAPEL_LABEL[v.papel]}` : ''}</Selo>
          ))}
        </Card>
      </section>

      {(data?.lideres.length ?? 0) > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-grafite/60 mb-2">Meus líderes</h2>
          <Card className="divide-y divide-black/[0.06]">
            {data!.lideres.map((l) => (
              <div key={l.org_id + l.pessoa_id} className="p-3.5 flex items-center gap-3">
                <Iniciais nome={l.nome} />
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{l.nome}</p>
                  <p className="text-xs text-grafite/50">{l.org_nome} · {PAPEL_LABEL[l.papel as Papel]}</p>
                </div>
                {l.telefone && <a href={linkWhats(l.telefone, `Olá, ${l.nome.split(' ')[0]}!`)} target="_blank" rel="noreferrer"
                  className="h-9 px-3 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold inline-flex items-center gap-1.5"><MessageCircle className="h-3.5 w-3.5" />WhatsApp</a>}
              </div>
            ))}
          </Card>
        </section>
      )}

      <section id="folgas" className="scroll-mt-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-grafite/60">Minhas folgas e indisponibilidades</h2>
          <Botao variante="fantasma" className="h-8 text-xs" onClick={() => setNova(true)}><Plus className="h-4 w-4" />Adicionar</Botao>
        </div>
        <Card className="divide-y divide-black/[0.06]">
          {!data?.ind.length ? <p className="p-4 text-sm text-grafite/50 flex items-center gap-2"><CalendarOff className="h-4 w-4" />Avise aqui quando não puder servir (viagens, compromissos). Seus líderes verão ao montar a escala.</p>
            : data.ind.map((i) => (
              <div key={i.id} className="p-3.5 flex items-center gap-3">
                <div className="flex-1">
                  <p className="text-sm font-medium">{fmtDataCurta(i.inicio)}{fmtDataCurta(i.inicio) !== fmtDataCurta(i.fim) ? ` a ${fmtDataCurta(i.fim)}` : ''}</p>
                  {i.motivo && <p className="text-xs text-grafite/50">{i.motivo}</p>}
                </div>
                <button onClick={() => removerInd(i)} className="p-2 text-grafite/35 hover:text-red-600" aria-label="Remover"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
        </Card>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-grafite/60 mb-2">Avisos recentes</h2>
        <Card className="divide-y divide-black/[0.06]">
          {!data?.notif.length ? <p className="p-4 text-sm text-grafite/50 flex items-center gap-2"><Bell className="h-4 w-4" />Nenhum aviso ainda.</p> : data.notif.map((n) => (
            <div key={n.id} className="p-3.5">
              <p className="text-sm font-medium text-verde">{n.titulo}</p>
              <p className="text-xs text-grafite/60 mt-0.5 whitespace-pre-line line-clamp-3">{n.mensagem.replace(/\*/g, '')}</p>
              <p className="text-[11px] text-grafite/40 mt-1">{fmtDiaHora(n.criado_em)}</p>
            </div>
          ))}
        </Card>
      </section>

      <div className="space-y-2">
        {admin && <Link to="/admin" className="md:hidden block"><Botao variante="secundario" className="w-full"><Settings className="h-4 w-4" />Administração</Botao></Link>}
        <Botao variante="fantasma" className="w-full" onClick={sair}><LogOut className="h-4 w-4" />Sair</Botao>
      </div>

      <PainelEditar aberto={editando} onFechar={() => setEditando(false)} onSalvo={recarregar} />
      <PainelIndisp aberto={nova} onFechar={() => setNova(false)} onSalvo={reload} />
    </div>
  )
}

function PainelEditar({ aberto, onFechar, onSalvo }: { aberto: boolean; onFechar: () => void; onSalvo: () => void }) {
  const { eu } = useAuth()
  const avisar = useAviso()
  const [f, setF] = useState({ nome: eu!.nome, telefone: fmtTel(eu!.telefone) })
  async function salvar() {
    const dig = f.telefone.replace(/\D/g, '')
    const { error } = await supabase.from('pessoas').update({ nome: f.nome.trim(), telefone: dig ? (dig.length <= 11 ? '55' + dig : dig) : null }).eq('id', eu!.id)
    if (error) return avisar(msgErro(error), 'erro')
    avisar('Dados atualizados.'); onFechar(); onSalvo()
  }
  return (
    <Painel aberto={aberto} onFechar={onFechar} titulo="Meus dados" rodape={<Botao className="w-full" onClick={salvar}>Salvar</Botao>}>
      <div className="space-y-4">
        <Campo rotulo="Nome"><Entrada value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} /></Campo>
        <Campo rotulo="WhatsApp" dica="É por ele que você recebe as escalas."><Entrada inputMode="tel" value={f.telefone} onChange={(e) => setF({ ...f, telefone: e.target.value })} /></Campo>
      </div>
    </Painel>
  )
}

function PainelIndisp({ aberto, onFechar, onSalvo }: { aberto: boolean; onFechar: () => void; onSalvo: () => void }) {
  const { eu } = useAuth()
  const avisar = useAviso()
  const hoje = format(new Date(), 'yyyy-MM-dd')
  const [f, setF] = useState({ de: hoje, ate: hoje, motivo: '' })
  async function salvar() {
    const inicio = new Date(`${f.de}T00:00`), fim = addDays(new Date(`${f.ate}T00:00`), 1)
    if (fim <= inicio) return avisar('A data final precisa ser igual ou depois da inicial.', 'erro')
    const { error } = await supabase.from('indisponibilidades').insert({ pessoa_id: eu!.id, inicio: inicio.toISOString(), fim: fim.toISOString(), motivo: f.motivo || null })
    if (error) return avisar(msgErro(error), 'erro')
    avisar('Indisponibilidade registrada.'); onFechar(); onSalvo()
  }
  return (
    <Painel aberto={aberto} onFechar={onFechar} titulo="Não poderei servir" rodape={<Botao className="w-full" onClick={salvar}>Salvar</Botao>}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="De"><Entrada type="date" value={f.de} onChange={(e) => setF({ ...f, de: e.target.value, ate: e.target.value > f.ate ? e.target.value : f.ate })} /></Campo>
          <Campo rotulo="Até"><Entrada type="date" value={f.ate} min={f.de} onChange={(e) => setF({ ...f, ate: e.target.value })} /></Campo>
        </div>
        <Campo rotulo="Motivo (opcional)"><Entrada value={f.motivo} onChange={(e) => setF({ ...f, motivo: e.target.value })} placeholder="Ex.: viagem" /></Campo>
      </div>
    </Painel>
  )
}
