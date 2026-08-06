import { cn } from "@/lib/cn";

/**
 * The mark is the taka sign on a solid brand-blue plate — quiet, legible at
 * every size, and the same blue that marks profit and primary actions.
 */
export function BrandMark({
  size = "md",
  className,
}: {
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const sizes = {
    sm: "size-9 text-lg rounded-xl",
    md: "size-12 text-2xl rounded-2xl",
    lg: "size-16 text-3xl rounded-[1.25rem]",
  };

  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center font-bold text-white",
        "bg-brand shadow-sm",
        sizes[size],
        className,
      )}
    >
      ৳
    </span>
  );
}

/** Mark plus wordmark, for the places a product needs to introduce itself. */
export function BrandLock({
  size = "md",
  tagline,
  className,
}: {
  size?: "sm" | "md" | "lg";
  tagline?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <BrandMark size={size} />
      <span className="min-w-0">
        <span
          className={cn(
            "block font-semibold tracking-tight text-body",
            size === "lg" ? "text-2xl" : size === "md" ? "text-xl" : "text-base",
          )}
          style={{ fontFamily: "var(--font-display)" }}
        >
          Ride Monitor
        </span>
        {tagline && <span className="block truncate text-sm text-muted">{tagline}</span>}
      </span>
    </div>
  );
}
