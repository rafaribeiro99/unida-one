export const linkWhats = (tel: string | null | undefined, texto: string) =>
  `https://wa.me/${(tel ?? '').replace(/\D/g, '')}?text=${encodeURIComponent(texto)}`

export const fmtTel = (t: string | null | undefined) => {
  if (!t) return ''
  const n = t.replace(/\D/g, '').replace(/^55/, '')
  if (n.length === 11) return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`
  if (n.length === 10) return `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`
  return t
}

export const textoConvite = (nome: string, token: string) =>
  `Olá, ${nome.split(' ')[0]}! Você foi convidado(a) para o UNIDA ONE, o app de escalas da Unida da Graça. Crie seu acesso: ${location.origin}/convite/${token}`
