"use client"

import toast from "react-hot-toast"

export function toastWarning(message: string, id?: string) {
  return toast(message, {
    id,
    icon: "⚠️",
    style: {
      borderColor: "rgba(245, 158, 11, 0.28)",
    },
  })
}

export function toastInfo(message: string, id?: string) {
  return toast(message, {
    id,
    icon: "ℹ️",
    style: {
      borderColor: "rgba(96, 165, 250, 0.28)",
    },
  })
}

export function confirmToast(
  message: string,
  options: {
    confirmLabel?: string
    cancelLabel?: string
    danger?: boolean
  } = {}
) {
  const {
    confirmLabel = "Confirmar",
    cancelLabel = "Cancelar",
    danger = false,
  } = options

  return new Promise<boolean>((resolve) => {
    let settled = false

    const finish = (value: boolean, toastId: string) => {
      if (settled) return
      settled = true
      toast.dismiss(toastId)
      resolve(value)
    }

    toast.custom(
      (currentToast) => (
        <div
          className={`w-[min(92vw,430px)] rounded-xl border border-white/10 bg-[#161616] px-4 py-3 text-white shadow-2xl transition-all ${
            currentToast.visible
              ? "translate-y-0 opacity-100"
              : "-translate-y-2 opacity-0"
          }`}
        >
          <p className="text-sm leading-5 text-gray-200">{message}</p>
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => finish(false, currentToast.id)}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-gray-300 transition-colors hover:bg-white/10 hover:text-white"
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              onClick={() => finish(true, currentToast.id)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                danger
                  ? "border-red-500/30 bg-red-500/15 text-red-300 hover:bg-red-500/25"
                  : "border-purple-500/30 bg-purple-500/20 text-purple-200 hover:bg-purple-500/30"
              }`}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      ),
      { duration: Infinity }
    )
  })
}
