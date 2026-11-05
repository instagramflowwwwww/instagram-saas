export const STAT_CARD_ACCENTS: Record<string, string> = {
  pink: "rgba(236,72,153,0.3)",
  purple: "rgba(192,132,252,0.3)",
  green: "rgba(74,222,128,0.3)",
  amber: "rgba(251,191,36,0.3)",
  blue: "rgba(56,189,248,0.3)",
  red: "rgba(248,113,113,0.3)",
}

export function statCardBorder(iconClassName: string, hero?: boolean) {
  if (hero) {
    return "linear-gradient(135deg, rgba(192,132,252,0.55), rgba(255,255,255,0.03) 40%, rgba(236,72,153,0.3) 100%)"
  }
  const match = iconClassName.match(/text-(\w+)-\d+/)
  const accent = (match && STAT_CARD_ACCENTS[match[1]]) || STAT_CARD_ACCENTS.purple
  return `linear-gradient(135deg, ${accent}, rgba(255,255,255,0.03) 60%)`
}
