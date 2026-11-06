import { cn } from "cn"

function Spinner({ className }: { className?: string }) {
  return (
    <span
      data-slot="spinner"
      aria-hidden
      className={cn(
        "inline-block size-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-[spin_3s_linear_infinite]",
        className
      )}
    />
  )
}

function Loading({ label = "Loading…", className }: { label?: string; className?: string }) {
  return (
    <p className={cn("flex items-center gap-2 text-sm text-muted-foreground", className)}>
      <Spinner className="text-primary" />
      {label}
    </p>
  )
}

export { Loading, Spinner }
