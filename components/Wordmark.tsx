export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      Insta
      <span className="inline-flex items-center rounded-full bg-amber-400 px-2.5 py-0.5 text-[0.5em] font-bold leading-none text-black">
        FLOW
      </span>
    </span>
  )
}
