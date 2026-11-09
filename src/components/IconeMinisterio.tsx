import { Baby, Camera, DoorOpen, Drama, Hammer, HandHeart, HandHelping, Heart, Home, Megaphone, Music2, Shirt, Sparkles, Users, BookOpen, Church, type LucideIcon } from 'lucide-react'

const MAPA: [RegExp, LucideIcon][] = [
  [/louvor|m[uú]sica/i, Music2],
  [/multim[ií]dia|m[ií]dia|som/i, Camera],
  [/kids|infantil|crian/i, Baby],
  [/teens|young|jovens|adolesc/i, Sparkles],
  [/fam[ií]lia/i, Home],
  [/interce/i, Heart],
  [/diacon/i, HandHelping],
  [/welcome|recep/i, DoorOpen],
  [/dan[cç]a/i, Sparkles],
  [/teatro/i, Drama],
  [/dorcas/i, Shirt],
  [/levita/i, Hammer],
  [/a[cç][aã]o/i, HandHeart],
  [/comunica/i, Megaphone],
  [/pastoral|pastor/i, Church],
  [/escola|ebd|b[ií]bl/i, BookOpen],
]

export function IconeMinisterio({ nome, className }: { nome: string; className?: string }) {
  const Icone = MAPA.find(([r]) => r.test(nome))?.[1] ?? Users
  return <Icone className={className} strokeWidth={1.8} />
}
