import Link from "next/link";
import { PRODUCT_NAME, SUPPORT_EMAIL } from "@/lib/constants";
import { BrandMark } from "@/components/layout/brand-mark";

const LINKS = [
  { href: "/pricing", label: "Pricing" },
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy" },
  { href: "/support", label: "Support" },
] as const;

export function SiteFooter() {
  return (
    <footer className="border-t border-zinc-800/80 px-6 py-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2">
          <BrandMark size="sm" showWordmark />
          <p className="text-xs text-zinc-600">
            © {new Date().getFullYear()} {PRODUCT_NAME} · Free beta · BYOK
          </p>
        </div>
        <nav className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-zinc-500">
          {LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="hover:text-zinc-300">
              {link.label}
            </Link>
          ))}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="hover:text-zinc-300">
            Email us
          </a>
        </nav>
      </div>
    </footer>
  );
}
