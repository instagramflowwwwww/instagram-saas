// Extrai frames de um vídeo no próprio navegador, via <video> + <canvas>.
// Assim não precisamos de ffmpeg no servidor nem de transformação no storage.

function seekTo(video: HTMLVideoElement, time: number) {
  return new Promise<void>((resolve, reject) => {
    const onSeeked = () => {
      cleanup()
      resolve()
    }
    const onError = () => {
      cleanup()
      reject(new Error("Não foi possível avançar o vídeo."))
    }
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error("O vídeo demorou demais para responder."))
    }, 15_000)

    function cleanup() {
      clearTimeout(timer)
      video.removeEventListener("seeked", onSeeked)
      video.removeEventListener("error", onError)
    }

    video.addEventListener("seeked", onSeeked)
    video.addEventListener("error", onError)
    video.currentTime = time
  })
}

export async function extractVideoFrames(url: string, count = 4): Promise<string[]> {
  const video = document.createElement("video")
  video.crossOrigin = "anonymous"
  video.preload = "auto"
  video.muted = true
  video.playsInline = true
  video.src = url

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("O vídeo demorou demais para carregar.")),
      20_000
    )
    video.addEventListener(
      "loadeddata",
      () => {
        clearTimeout(timer)
        resolve()
      },
      { once: true }
    )
    video.addEventListener(
      "error",
      () => {
        clearTimeout(timer)
        reject(
          new Error(
            "O navegador não conseguiu abrir o vídeo para leitura. Quase sempre é CORS: falta liberar a leitura externa no bucket do R2."
          )
        )
      },
      { once: true }
    )
  })

  const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0
  if (!duration) throw new Error("Não foi possível ler a duração do vídeo.")

  const longestSide = Math.max(video.videoWidth, video.videoHeight, 1)
  const scale = Math.min(1, 720 / longestSide)
  const canvas = document.createElement("canvas")
  canvas.width = Math.max(1, Math.round(video.videoWidth * scale))
  canvas.height = Math.max(1, Math.round(video.videoHeight * scale))

  const context = canvas.getContext("2d")
  if (!context) throw new Error("O navegador não conseguiu preparar a leitura dos frames.")

  const frames: string[] = []
  try {
    for (let index = 0; index < count; index += 1) {
      // Pega o meio de cada fatia: evita o primeiro e o último instante,
      // que costumam ser pretos.
      await seekTo(video, duration * ((index + 0.5) / count))
      context.drawImage(video, 0, 0, canvas.width, canvas.height)

      try {
        frames.push(canvas.toDataURL("image/jpeg", 0.7))
      } catch {
        throw new Error(
          "O navegador bloqueou a leitura deste vídeo (CORS). É preciso liberar a leitura no bucket R2."
        )
      }
    }
  } finally {
    video.removeAttribute("src")
    video.load()
  }

  return frames
}
