import Image from "next/image";
import Link from "next/link";
import { PRODUCT_NAME } from "@/lib/constants";
import { cn } from "@/lib/utils";

type BrandMarkProps = {
  href?: string;
  /** Show product name next to the icon. */
  showWordmark?: boolean;
  /** Marketing / in-app beta chip. */
  showBeta?: boolean;
  size?: "sm" | "md";
  className?: string;
  wordmarkClassName?: string;
  /** Prefetch the logo (use once in the primary header). */
  priority?: boolean;
};

/**
 * Official PixelCrew mark — voxel P from /marketing/icon.png.
 */
export function BrandMark({
  href = "/",
  showWordmark = true,
  showBeta = false,
  size = "md",
  className,
  wordmarkClassName,
  priority = false,
}: BrandMarkProps) {
  const px = size === "sm" ? 28 : 32;

  return (
    <Link
      href={href}
      className={cn("flex items-center gap-2 font-semibold tracking-tight text-zinc-100", className)}
    >
      <Image
        src="/marketing/icon.png"
        alt=""
        width={px}
        height={px}
        className="shrink-0 rounded-lg"
        priority={priority}
      />
      {showWordmark && (
        <span
          className={cn(
            "font-semibold tracking-tight",
            size === "sm" && "text-sm",
            wordmarkClassName,
          )}
        >
          {PRODUCT_NAME}
        </span>
      )}
      {showBeta && (
        <span className="rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-200">
          Beta
        </span>
      )}
    </Link>
  );
}
