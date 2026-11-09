import { useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Copy, Plus, Search, Trash2 } from 'lucide-react'
import { Botao, Campo, Entrada, Painel, Selecao, useAviso } from './ui'
import { supabase, msgErro } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import type { Funcao } from '../lib/types'

export interface ItemLiturgia { id: string; evento_id: string; ordem: number; titulo: string; org_id: string | null; funcao_id: string | null; responsavel_texto: string | null; horario: string | null; observacao: string | null }
export interface ItemRepertorio { id: string; org_id: string; ordem: number; tom: string | null; observacao: string | null; musicas: { id: string; titulo: string; artista: string | null; tom: string | null; link: string | null; cifra_link: string | null } }

/** Reduz a imagem no aparelho (lado maior até 1600px, JPEG) antes de enviar */
async function comprimir(f: File): Promise<Blob> {
  const img = await createImageBitmap(f)
  const escala = Math.min(1, 1600 / Math.max(img.width, img.height))
  const c = document.createElement('canvas')
  c.width = Math.round(img.width * escala); c.height = Math.round(img.height * escala)
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
  return new Promise((ok, erro) => c.toBlob((b) => (b ? ok(b) : erro(new Error('Não foi possível ler a imagem.'))), 'image/jpeg', 0.82))
}

export async function enviarBanner(eventoId: string, f: File, serie: boolean): Promise<number> {
  const blob = await comprimir(f)
  const caminho = `${eventoId}-${Date.now()}.jpg`
  const { error } = await supabase.storage.from('banners').upload(caminho, blob, { contentType: 'image/jpeg' })
  if (error) throw error
  const url = supabase.storage.from('banners').getPublicUrl(caminho).data.publicUrl
  const { data, error: e2 } = await supabase.rpc('definir_banner', { p_evento: eventoId, p_url: url, p_serie: serie })
  if (e2) throw e2
  return data as number
}

const SUGESTOES = ['Abertura', 'Louvor', 'Oração', 'Dízimos e Ofertas', 'Avisos', 'Mensagem', 'Ceia', 'Apelo', 'Encerramento']

export function EditorLiturgia({ aberto, onFechar, eventoId, itens, onMudou }: { aberto: boolean; onFechar: () => void; eventoId: string; itens: ItemLiturgia[]; onMudou: () => void }) {
  const { orgs } = useAuth()
  const avisar = useAviso()
  const [lista, setLista] = useState<ItemLiturgia[]>([])
  const [novo, setNovo] = useState({ titulo: '', modo: 'texto' as 'texto' | 'escala' | 'ministerio', texto: '', org: '', funcao: '' })
  const [funcoes, setFuncoes] = useState<Funcao[]>([])
  const areas = useMemo(() => orgs.filter((o) => ['pilar', 'ministerio', 'equipe'].includes(o.tipo) && !['Ministerial', 'Grupos Pequenos'].includes(o.nome)), [orgs])

  useEffect(() => { if (aberto) setLista(itens) }, [aberto, itens])
  useEffect(() => {
    if (!novo.org) { setFuncoes([]); return }
    supabase.from('funcoes').select('*').eq('org_id', novo.org).order('ordem').then(({ data }) => setFuncoes((data ?? []) as Funcao[]))
  }, [novo.org])

  async function adicionar() {
    if (!novo.titulo.trim()) return avisar('Informe o momento (ex.: Mensagem).', 'erro')
    const linha = {
      evento_id: eventoId, ordem: (lista[lista.length - 1]?.ordem ?? 0) + 1, titulo: novo.titulo.trim(),
      org_id: novo.modo !== 'texto' ? novo.org || null : null,
      funcao_id: novo.modo === 'escala' ? novo.funcao || null : null,
      responsavel_texto: novo.modo === 'texto' ? novo.texto.trim() || null : null,
    }
    const { error } = await supabase.from('liturgia_itens').insert(linha)
    if (error) return avisar(msgErro(error), 'erro')
    setNovo({ titulo: '', modo: 'texto', texto: '', org: '', funcao: '' }); onMudou()
  }
  async function mover(i: number, dir: -1 | 1) {
    const a = lista[i], b = lista[i + dir]
    if (!a || !b) return
    await Promise.all([
      supabase.from('liturgia_itens').update({ ordem: b.ordem }).eq('id', a.id),
      supabase.from('liturgia_itens').update({ ordem: a.ordem === b.ordem ? a.ordem + dir : a.ordem }).eq('id', b.id),
    ])
    onMudou()
  }
  async function remover(id: string) {
    const { error } = await supabase.from('liturgia_itens').delete().eq('id', id)
    if (error) return avisar(msgErro(error), 'erro')
    onMudou()
  }
  async function copiar() {
    const { data, error } = await supabase.rpc('copiar_liturgia', { p_evento: eventoId })
    if (error) return avisar(msgErro(error), 'erro')
    avisar(`${data} momentos copiados do último culto igual.`); onMudou()
  }

  return (
    <Painel aberto={aberto} onFechar={onFechar} titulo="Programação do culto">
      <div className="space-y-5 pb-2">
        <Botao variante="secundario" className="w-full" onClick={copiar}><Copy className="h-4 w-4" />Copiar do último culto igual</Botao>
        {lista.length > 0 && (
          <div className="space-y-1.5">
            {lista.map((it, i) => (
              <div key={it.id} className="flex items-center gap-2 rounded-xl bg-white border border-black/[0.05] px-3 py-2">
                <span className="text-xs font-bold text-grafite/40 w-4">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-verde truncate">{it.titulo}</p>
                  <p className="text-xs text-grafite/50 truncate">{it.funcao_id ? 'Responsável vem da escala' : it.org_id ? orgs.find((o) => o.id === it.org_id)?.nome : it.responsavel_texto ?? '—'}</p>
                </div>
                <button onClick={() => mover(i, -1)} disabled={i === 0} className="p-1.5 text-grafite/40 disabled:opacity-20" aria-label="Subir"><ArrowUp className="h-4 w-4" /></button>
                <button onClick={() => mover(i, 1)} disabled={i === lista.length - 1} className="p-1.5 text-grafite/40 disabled:opacity-20" aria-label="Descer"><ArrowDown className="h-4 w-4" /></button>
                <button onClick={() => remover(it.id)} className="p-1.5 text-grafite/35 hover:text-red-600" aria-label="Remover"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
        )}
        <div className="rounded-2xl bg-white border border-black/[0.05] p-3.5 space-y-3">
          <p className="text-sm font-semibold text-verde">Adicionar momento</p>
          <div className="flex flex-wrap gap-1.5">
            {SUGESTOES.map((s) => <button key={s} onClick={() => setNovo({ ...novo, titulo: s })} className="rounded-full bg-black/[0.04] px-2.5 py-1 text-xs text-grafite/70">{s}</button>)}
          </div>
          <Entrada value={novo.titulo} onChange={(e) => setNovo({ ...novo, titulo: e.target.value })} placeholder="Momento (ex.: Mensagem)" />
          <Campo rotulo="Quem conduz">
            <Selecao value={novo.modo} onChange={(e) => setNovo({ ...novo, modo: e.target.value as typeof novo.modo })}>
              <option value="escala">Vem da escala (ministério + função)</option>
              <option value="ministerio">Um ministério (ex.: Louvor, com repertório)</option>
              <option value="texto">Escrever o nome</option>
            </Selecao>
          </Campo>
          {novo.modo === 'texto' && <Entrada value={novo.texto} onChange={(e) => setNovo({ ...novo, texto: e.target.value })} placeholder="Ex.: Pr. Osvaldo" />}
          {novo.modo !== 'texto' && (
            <Selecao value={novo.org} onChange={(e) => setNovo({ ...novo, org: e.target.value, funcao: '' })}>
              <option value="">Escolha o ministério</option>
              {areas.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
            </Selecao>
          )}
          {novo.modo === 'escala' && novo.org && (
            <Selecao value={novo.funcao} onChange={(e) => setNovo({ ...novo, funcao: e.target.value })}>
              <option value="">Escolha a função</option>
              {funcoes.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
            </Selecao>
          )}
          <Botao className="w-full h-10" onClick={adicionar}><Plus className="h-4 w-4" />Adicionar</Botao>
        </div>
      </div>
    </Painel>
  )
}

export function EditorRepertorio({ orgId, onFechar, eventoId, itens, onMudou }: { orgId: string | null; onFechar: () => void; eventoId: string; itens: ItemRepertorio[]; onMudou: () => void }) {
  const { eu } = useAuth()
  const avisar = useAviso()
  const [busca, setBusca] = useState('')
  const [achadas, setAchadas] = useState<ItemRepertorio['musicas'][]>([])
  const [nova, setNova] = useState<{ titulo: string; artista: string; tom: string; link: string; cifra_link: string } | null>(null)

  useEffect(() => {
    if (!orgId) return
    const t = setTimeout(() => {
      let qy = supabase.from('musicas').select('id,titulo,artista,tom,link,cifra_link').order('titulo').limit(8)
      if (busca.trim()) qy = qy.ilike('titulo', `%${busca.trim()}%`)
      qy.then(({ data }) => setAchadas((data ?? []) as ItemRepertorio['musicas'][]))
    }, 200)
    return () => clearTimeout(t)
  }, [busca, orgId])

  if (!orgId) return null
  const jaTem = new Set(itens.map((i) => i.musicas.id))

  async function incluir(musicaId: string) {
    const { error } = await supabase.from('repertorio').insert({ evento_id: eventoId, org_id: orgId, musica_id: musicaId, ordem: (itens[itens.length - 1]?.ordem ?? 0) + 1 })
    if (error) return avisar(msgErro(error), 'erro')
    onMudou()
  }
  async function criar() {
    if (!nova?.titulo.trim()) return avisar('Informe o nome do hino.', 'erro')
    const { data, error } = await supabase.from('musicas').insert({ unidade_id: eu!.unidade_id, titulo: nova.titulo.trim(), artista: nova.artista || null,
      tom: nova.tom || null, link: nova.link || null, cifra_link: nova.cifra_link || null }).select('id').single()
    if (error) return avisar(msgErro(error), 'erro')
    setNova(null); setBusca(''); await incluir(data.id)
  }
  async function mover(i: number, dir: -1 | 1) {
    const a = itens[i], b = itens[i + dir]
    if (!a || !b) return
    await Promise.all([
      supabase.from('repertorio').update({ ordem: b.ordem }).eq('id', a.id),
      supabase.from('repertorio').update({ ordem: a.ordem === b.ordem ? a.ordem + dir : a.ordem }).eq('id', b.id),
    ])
    onMudou()
  }
  async function remover(id: string) {
    await supabase.from('repertorio').delete().eq('id', id); onMudou()
  }

  return (
    <Painel aberto onFechar={onFechar} titulo="Hinos do culto">
      <div className="space-y-5 pb-2">
        {itens.length > 0 && (
          <div className="space-y-1.5">
            {itens.map((r, i) => (
              <div key={r.id} className="flex items-center gap-2 rounded-xl bg-white border border-black/[0.05] px-3 py-2">
                <span className="text-xs font-bold text-grafite/40 w-4">{i + 1}</span>
                <p className="flex-1 min-w-0 text-sm font-semibold text-verde truncate">{r.musicas.titulo}</p>
                <button onClick={() => mover(i, -1)} disabled={i === 0} className="p-1 text-grafite/40 disabled:opacity-20" aria-label="Subir"><ArrowUp className="h-4 w-4" /></button>
                <button onClick={() => mover(i, 1)} disabled={i === itens.length - 1} className="p-1 text-grafite/40 disabled:opacity-20" aria-label="Descer"><ArrowDown className="h-4 w-4" /></button>
                <button onClick={() => remover(r.id)} className="p-1 text-grafite/35 hover:text-red-600" aria-label="Remover"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
        )}
        {!nova ? (
          <div className="space-y-2">
            <div className="relative">
              <Search className="h-4 w-4 absolute left-3 top-3.5 text-grafite/40" />
              <Entrada className="pl-9" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar hino já cadastrado" />
            </div>
            {achadas.filter((m) => !jaTem.has(m.id)).map((m) => (
              <button key={m.id} onClick={() => incluir(m.id)} className="w-full flex items-center gap-2 rounded-xl bg-white border border-black/[0.05] px-3 py-2.5 text-left">
                <span className="flex-1 text-sm">{m.titulo}</span>
                <Plus className="h-4 w-4 text-verde-2" />
              </button>
            ))}
            <Botao variante="secundario" className="w-full" onClick={() => setNova({ titulo: busca, artista: '', tom: '', link: '', cifra_link: '' })}><Plus className="h-4 w-4" />Cadastrar hino novo</Botao>
          </div>
        ) : (
          <div className="rounded-2xl bg-white border border-black/[0.05] p-3.5 space-y-3">
            <Entrada autoFocus value={nova.titulo} onChange={(e) => setNova({ ...nova, titulo: e.target.value })} placeholder="Nome do hino" />
            <div className="flex gap-2"><Botao variante="fantasma" onClick={() => setNova(null)}>Voltar</Botao><Botao className="flex-1" onClick={criar}>Salvar e incluir</Botao></div>
          </div>
        )}
      </div>
    </Painel>
  )
}
