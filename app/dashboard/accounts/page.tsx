"use client"

import { useEffect, useState } from "react"
import {
  CheckCircle,
  Globe,
  Instagram,
  Key,
  Lock,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  User,
  XCircle,
} from "lucide-react"

type InstagramAccount = {
  id: string
  username: string
  profilePicture: string | null
  followerCount: number | null
  isActive: boolean
  proxy: string | null
}

const emptyLoginData = {
  username: "",
  password: "",
  verificationCode: "",
  challengeToken: "",
  proxy: "",
}

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<InstagramAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [proxyOpenFor, setProxyOpenFor] = useState<string | null>(null)
  const [proxyValue, setProxyValue] = useState("")
  const [savingProxy, setSavingProxy] = useState(false)
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false)
  const [loginData, setLoginData] = useState(emptyLoginData)
  const [isLoggingIn, setIsLoggingIn] = useState(false)
  const [loginError, setLoginError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [show2FA, setShow2FA] = useState(false)

  const fetchAccounts = async () => {
    try {
      const response = await fetch("/api/instagram/accounts", { cache: "no-store" })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Erro ao carregar as contas")
      }

      setAccounts(Array.isArray(data) ? data : [])
    } catch (error: any) {
      setLoginError(error.message || "Erro ao carregar as contas")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAccounts()
  }, [])

  const openLoginModal = (account?: InstagramAccount) => {
    setLoginData({
      ...emptyLoginData,
      username: account?.username || "",
      proxy: account?.proxy || "",
    })
    setShow2FA(false)
    setLoginError(null)
    setSuccessMessage(null)
    setIsLoginModalOpen(true)
  }

  const closeLoginModal = () => {
    if (isLoggingIn) return
    setIsLoginModalOpen(false)
    setLoginData(emptyLoginData)
    setShow2FA(false)
    setLoginError(null)
  }

  const removeAccount = async (id: string) => {
    if (!confirm("Remover esta conta?")) return

    const response = await fetch("/api/instagram/accounts", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    })

    if (!response.ok) {
      const data = await response.json().catch(() => ({}))
      setLoginError(data.error || "Não foi possível remover a conta")
      return
    }

    await fetchAccounts()
  }

  const openProxyEditor = (account: InstagramAccount) => {
    setProxyOpenFor(account.id)
    setProxyValue(account.proxy || "")
  }

  const saveProxy = async (accountId: string) => {
    setSavingProxy(true)
    setLoginError(null)

    try {
      const response = await fetch("/api/instagram/accounts/proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, proxy: proxyValue.trim() }),
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Não foi possível salvar o proxy")
      }

      await fetchAccounts()
      setProxyOpenFor(null)
    } catch (error: any) {
      setLoginError(error.message || "Não foi possível salvar o proxy")
    } finally {
      setSavingProxy(false)
    }
  }

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault()
    setIsLoggingIn(true)
    setLoginError(null)
    setSuccessMessage(null)

    try {
      const response = await fetch("/api/instagram/instagrapi-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(loginData),
      })
      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        if (data.requiresTwoFactor) {
          setShow2FA(true)
          setLoginData((current) => ({
            ...current,
            verificationCode:
              data.code === "TWO_FACTOR_INVALID"
                ? ""
                : current.verificationCode,
            challengeToken:
              typeof data.challengeToken === "string"
                ? data.challengeToken
                : current.challengeToken,
          }))
          setLoginError(
            data.error ||
              "Digite o código do aplicativo autenticador do Instagram."
          )
          return
        }

        throw new Error(data.error || "Não foi possível conectar a conta")
      }

      setIsLoginModalOpen(false)
      setLoginData(emptyLoginData)
      setShow2FA(false)
      setSuccessMessage(`@${data.account.username} conectada com sucesso.`)
      await fetchAccounts()
    } catch (error: any) {
      setLoginError(error.message || "Erro de conexão com o servidor")
    } finally {
      setIsLoggingIn(false)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Contas do Instagram</h1>
          <p className="text-gray-500 mt-1">{accounts.length}/30 contas conectadas</p>
        </div>
        <button
          onClick={() => openLoginModal()}
          className="flex items-center gap-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:opacity-90 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-opacity"
        >
          <Plus size={15} />
          Conectar Instagram
        </button>
      </div>

      {successMessage && (
        <div className="flex items-center gap-3 bg-green-500/10 border border-green-500/20 rounded-xl p-4 mb-6">
          <CheckCircle size={16} className="text-green-400" />
          <p className="text-green-400 text-sm font-medium">{successMessage}</p>
        </div>
      )}

      {!isLoginModalOpen && loginError && (
        <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/20 rounded-xl p-4 mb-6">
          <XCircle size={16} className="text-red-400" />
          <p className="text-red-400 text-sm font-medium">{loginError}</p>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {!loading && accounts.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          {accounts.map((account) => (
            <div key={account.id} className="bg-[#111] border border-white/5 rounded-xl p-5">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  {account.profilePicture ? (
                    <img src={account.profilePicture} alt="" className="w-10 h-10 rounded-full" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                      <Instagram size={16} className="text-white" />
                    </div>
                  )}
                  <div>
                    <p className="font-medium text-white text-sm">@{account.username}</p>
                    <p className="text-xs text-gray-500">
                      {account.followerCount
                        ? `${account.followerCount.toLocaleString()} seguidores`
                        : "—"}
                    </p>
                  </div>
                </div>
                <div className={`w-2 h-2 rounded-full mt-1 ${account.isActive ? "bg-green-400" : "bg-red-400"}`} />
              </div>

              <div className="flex items-center gap-2 mb-4">
                <span className={`px-2 py-0.5 rounded-full text-xs ${account.isActive ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}`}>
                  {account.isActive ? "Ativa" : "Reconexão necessária"}
                </span>
                {account.proxy && (
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-blue-500/10 text-blue-400">
                    <Globe size={10} />
                    Proxy
                  </span>
                )}
              </div>

              {proxyOpenFor === account.id ? (
                <div className="mb-3 space-y-2">
                  <input
                    type="text"
                    value={proxyValue}
                    onChange={(event) => setProxyValue(event.target.value)}
                    placeholder="ip:porta:usuario:senha"
                    className="w-full bg-white/5 border border-blue-500/30 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-blue-500"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => saveProxy(account.id)}
                      disabled={savingProxy}
                      className="flex-1 flex items-center justify-center gap-1.5 text-xs bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 py-2 rounded-lg transition-colors disabled:opacity-50"
                    >
                      <Save size={11} />
                      {savingProxy ? "Salvando..." : "Salvar"}
                    </button>
                    <button
                      onClick={() => setProxyOpenFor(null)}
                      className="px-3 text-xs text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 py-2 rounded-lg transition-colors"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => openProxyEditor(account)}
                  className="w-full flex items-center justify-center gap-1.5 text-xs text-gray-400 hover:text-blue-300 bg-white/5 hover:bg-blue-500/10 py-2 rounded-lg transition-colors mb-2"
                >
                  <Globe size={12} />
                  {account.proxy ? "Editar proxy" : "Adicionar proxy"}
                </button>
              )}

              <div className="flex gap-2">
                <button
                  onClick={() => openLoginModal(account)}
                  className="flex-1 flex items-center justify-center gap-1.5 text-xs text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 py-2 rounded-lg transition-colors"
                >
                  <RefreshCw size={12} />
                  Reconectar
                </button>
                <button
                  onClick={() => removeAccount(account.id)}
                  className="flex items-center justify-center gap-1.5 text-xs text-red-400 hover:text-red-300 bg-red-500/5 hover:bg-red-500/10 py-2 px-3 rounded-lg transition-colors"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && accounts.length === 0 && (
        <div className="bg-[#111] border border-white/5 rounded-xl p-16 text-center">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center mx-auto mb-5">
            <Instagram size={24} className="text-purple-400" />
          </div>
          <h3 className="font-semibold text-white mb-2">Nenhuma conta ainda</h3>
          <p className="text-gray-500 text-sm mb-6 max-w-xs mx-auto">
            Clique em Conectar Instagram para adicionar sua primeira conta
          </p>
          <button
            onClick={() => openLoginModal()}
            className="inline-flex items-center gap-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white text-sm font-medium px-6 py-3 rounded-lg hover:opacity-90 transition-opacity"
          >
            <Plus size={15} />
            Conectar Instagram
          </button>
        </div>
      )}

      {isLoginModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#111] border border-white/10 rounded-2xl w-full max-w-md p-8 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-white">Conectar Conta</h2>
              <button onClick={closeLoginModal} className="text-gray-500 hover:text-white transition-colors">
                <XCircle size={24} />
              </button>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5 ml-1">Usuário do Instagram</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
                  <input
                    type="text"
                    required
                    disabled={show2FA}
                    value={loginData.username}
                    onChange={(event) => setLoginData({ ...loginData, username: event.target.value })}
                    placeholder="seu_usuario"
                    className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-purple-500 transition-colors disabled:opacity-60"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5 ml-1">Senha</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
                  <input
                    type="password"
                    required
                    disabled={show2FA}
                    value={loginData.password}
                    onChange={(event) => setLoginData({ ...loginData, password: event.target.value })}
                    placeholder="••••••••"
                    className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-purple-500 transition-colors disabled:opacity-60"
                  />
                </div>
              </div>

              {show2FA && (
                <div>
                  <label className="block text-xs font-medium text-purple-400 mb-1.5 ml-1">
                    Código 2FA ou código de backup
                  </label>
                  <div className="relative">
                    <Key className="absolute left-3 top-1/2 -translate-y-1/2 text-purple-400" size={16} />
                    <input
                      type="text"
                      required
                      autoFocus
                      inputMode="numeric"
                      value={loginData.verificationCode}
                      onChange={(event) =>
                        setLoginData({
                          ...loginData,
                          verificationCode: event.target.value
                            .replace(/\D/g, "")
                            .slice(0, 8),
                        })
                      }
                      minLength={6}
                      maxLength={8}
                      pattern="[0-9]{6}|[0-9]{8}"
                      title="Use 6 dígitos do autenticador ou 8 dígitos de um código de backup"
                      placeholder="000000"
                      className="w-full bg-purple-500/5 border border-purple-500/30 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-purple-500 transition-colors"
                    />
                  </div>
                  <p className="text-[10px] text-gray-500 mt-2 ml-1">
                    Use o código atual de 6 dígitos do autenticador. Também aceitamos código de backup de 8 dígitos.
                  </p>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5 ml-1">Proxy residencial (opcional, recomendado na Vercel)</label>
                <div className="relative">
                  <Globe className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
                  <input
                    type="text"
                    disabled={show2FA}
                    value={loginData.proxy}
                    onChange={(event) => setLoginData({ ...loginData, proxy: event.target.value })}
                    placeholder="ip:porta:usuario:senha"
                    className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-purple-500 transition-colors disabled:opacity-60"
                  />
                </div>
              </div>

              {loginError && (
                <p className="text-red-400 text-xs font-medium bg-red-400/10 border border-red-400/20 rounded-lg p-3">
                  {loginError}
                </p>
              )}

              <button
                type="submit"
                disabled={isLoggingIn}
                className="w-full bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold py-3.5 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-2"
              >
                {isLoggingIn ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    {show2FA ? "Verificando..." : "Conectando..."}
                  </>
                ) : show2FA ? (
                  "Verificar código"
                ) : (
                  "Entrar agora"
                )}
              </button>

              <p className="text-[10px] text-gray-500 text-center px-4">
                A senha é usada somente durante o login. A sessão gerada é criptografada no banco.
              </p>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
