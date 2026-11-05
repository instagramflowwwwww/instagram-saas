import Anthropic from "@anthropic-ai/sdk"
import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 30

const MAX_HISTORY = 12
const MAX_MESSAGE_LENGTH = 2000

const SYSTEM = `Você é o assistente de IA do InstaFlow, um painel de automação de publicação no Instagram. Responda sempre em português do Brasil, de forma curta, direta e simpática.

O que o InstaFlow faz e onde fica cada coisa:
- Dashboard: visão geral — views de hoje, contas conectadas, posts publicados, fila, agendamentos, falhas, e um ranking geral dos usuários por views do dia.
- Postar / Automação (Agendamento): publicar manualmente ou agendar posts/reels/stories pra uma ou várias contas de uma vez.
- Stories: publicação e acompanhamento específico de Stories.
- Biblioteca: onde ficam os vídeos e imagens enviados, organizados em pastas, prontos pra usar nas publicações.
- Performance: views, curtidas e comentários reais de cada post, puxados direto da Meta.
- Histórico: lista de tudo que já foi publicado ou tentado, com status de sucesso/falha.
- Contas: gerenciar as contas do Instagram conectadas.
- Saúde das contas: diagnóstico de contas com problema (token vencido, desconectada, etc.).
- Pastas: agrupar contas, inclusive pra controle de pagamento de funcionários que gerenciam contas.
- Pagamentos: calendário de pagamento por pasta/funcionário.
- App Meta: configuração do app do Instagram usado pra autenticação (Instagram App ID e Secret) e conexão de novas contas.
- Status da Fila: posts aguardando ou em processamento pra publicar.
- Configurações: nome, foto de perfil, senha, aparência (tema claro/escuro), notificações (push) e alertas (queda de contas, meta de views, posts virais).

Regras:
- Nunca invente um recurso que não existe nessa lista. Se não tiver certeza, diga que não sabe e sugira falar com o suporte.
- Você não tem acesso aos dados reais da conta do usuário (views, contas conectadas, etc.) — só pode orientar sobre como usar o painel, nunca informar números específicos da conta dele.
- Se o problema parecer um bug ou algo fora do seu alcance, oriente a entrar em contato com o suporte.`

type ChatMessage = { role: "user" | "assistant"; content: string }

export async function POST(request: Request) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const rawMessages = Array.isArray(body.messages) ? body.messages : []

  const messages: ChatMessage[] = rawMessages
    .filter(
      (message: unknown): message is ChatMessage =>
        Boolean(message) &&
        typeof message === "object" &&
        (message as ChatMessage).role &&
        ["user", "assistant"].includes((message as ChatMessage).role) &&
        typeof (message as ChatMessage).content === "string"
    )
    .map((message: ChatMessage) => ({
      role: message.role,
      content: message.content.trim().slice(0, MAX_MESSAGE_LENGTH),
    }))
    .filter((message: ChatMessage) => message.content.length > 0)
    .slice(-MAX_HISTORY)

  if (messages.length === 0 || messages[messages.length - 1].role !== "user") {
    return NextResponse.json({ error: "Mensagem inválida." }, { status: 400 })
  }

  try {
    const client = new Anthropic()

    const response = await client.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 700,
      system: SYSTEM,
      messages,
    })

    const reply = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim()

    if (!reply) {
      return NextResponse.json(
        { error: "A IA não conseguiu responder agora. Tente de novo." },
        { status: 502 }
      )
    }

    return NextResponse.json({ reply })
  } catch (error) {
    console.error("[ai-assistant] Falha ao responder", error)
    return NextResponse.json(
      { error: "Não foi possível falar com o assistente agora. Tente novamente em instantes." },
      { status: 500 }
    )
  }
}
