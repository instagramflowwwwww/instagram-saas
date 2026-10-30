export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      Insta
      <span className="inline-flex items-center rounded-full bg-gradient-to-r from-purple-500 to-pink-500 px-2.5 py-0.5 text-[0.5em] font-bold leading-none text-white">
        FLOW
      </span>
    </span>
  )
}
