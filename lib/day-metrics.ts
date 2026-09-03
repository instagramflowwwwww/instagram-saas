// As contas são conectadas no fuso do usuário, não em UTC. Agrupar por dia em
// UTC jogaria tudo que entra depois das 21h para o dia seguinte.
export const TIME_ZONE = "America/Sao_Paulo"

export function localDay(date: Date) {
  // en-CA devolve no formato AAAA-MM-DD, que ordena sozinho.
  return date.toLocaleDateString("en-CA", { timeZone: TIME_ZONE })
}

export function countByDay(dates: Date[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const date of dates) {
    const day = localDay(date)
    counts.set(day, (counts.get(day) || 0) + 1)
  }
  return counts
}

// Série contínua dos últimos `days` dias, incluindo hoje. Dias sem nenhum
// evento entram como zero — senão o gráfico mente sobre o ritmo.
export function recentSeries(counts: Map<string, number>, days: number) {
  const series: { day: string; count: number }[] = []
  for (let ago = days - 1; ago >= 0; ago -= 1) {
    const date = new Date()
    date.setUTCDate(date.getUTCDate() - ago)
    const day = localDay(date)
    series.push({ day, count: counts.get(day) || 0 })
  }
  return series
}

export function windowStats(counts: Map<string, number>) {
  const series = recentSeries(counts, 30)
  const today = series[series.length - 1]?.day || localDay(new Date())
  const yesterday = series[series.length - 2]?.day || today

  return {
    today: counts.get(today) || 0,
    yesterday: counts.get(yesterday) || 0,
    last7: series.slice(-7).reduce((total, entry) => total + entry.count, 0),
    last30: series.reduce((total, entry) => total + entry.count, 0),
  }
}
