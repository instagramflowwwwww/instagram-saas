import Anthropic from "@anthropic-ai/sdk"
import { z } from "zod"
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod"

// Legenda gerada a partir de alguns frames do vídeo. Mandar frames em vez do
// arquivo inteiro dá quase o mesmo resultado e custa uma fração.
const CaptionSchema = z.object({
  caption: z
    .string()
    .describe("Legenda pronta para publicar, sem hashtags e sem aspas."),
  hashtags: z
    .string()
    .describe("Hashtags separadas por espaço, cada uma começando com #."),
  description: z
    .string()
    .describe("Uma frase dizendo o que aparece no vídeo, para o usuário conferir."),
})

export type GeneratedCaption = z.infer<typeof CaptionSchema>

const SYSTEM = `Você escreve legendas para posts do Instagram em português do Brasil.

Regras:
- A legenda precisa nascer do que realmente aparece nos frames. Nada genérico.
- Máximo de 220 caracteres na legenda, sem hashtags dentro dela.
- Tom natural de quem fala com o público, não de anúncio. Sem "confira", sem "imperdível".
- No máximo um emoji, e só se ele acrescentar algo.
- Entre 4 e 8 hashtags, específicas do assunto do vídeo.
- Se os frames não deixarem claro o que é o vídeo, diga isso na descrição e escreva
  uma legenda curta e honesta em vez de inventar.`

export async function generateCaptionFromFrames(params: {
  frames: string[]
  context?: string
}): Promise<GeneratedCaption> {
  const client = new Anthropic()

  const instruction = params.context?.trim()
    ? `Estes são frames em ordem de um vídeo curto.\n\nSobre o perfil e o tom desejado: ${params.context.trim()}`
    : "Estes são frames em ordem de um vídeo curto."

  const response = await client.messages.parse({
    model: "claude-opus-5",
    max_tokens: 8000,
    system: SYSTEM,
    thinking: { type: "adaptive" },
    output_config: {
      effort: "medium",
      format: zodOutputFormat(CaptionSchema),
    },
    messages: [
      {
        role: "user",
        content: [
          ...params.frames.map((data) => ({
            type: "image" as const,
            source: {
              type: "base64" as const,
              media_type: "image/jpeg" as const,
              data,
            },
          })),
          { type: "text" as const, text: instruction },
        ],
      },
    ],
  })

  if (response.stop_reason === "refusal") {
    throw new Error(
      "A IA não quis descrever este vídeo. Tente com outro conteúdo."
    )
  }

  if (!response.parsed_output) {
    throw new Error("A IA respondeu num formato inesperado. Tente de novo.")
  }

  return response.parsed_output
}
