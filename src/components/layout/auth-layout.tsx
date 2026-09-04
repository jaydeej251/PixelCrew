import Link from "next/link";
import { BrandMark } from "@/components/layout/brand-mark";

type AuthLayoutProps = {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
};

export function AuthLayout({ title, subtitle, children, footer }: AuthLayoutProps) {
  return (
    <div className="auth-grid min-h-screen text-zinc-100">
      <header className="border-b border-zinc-800/80 px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <BrandMark priority />
          <Link href="/pricing" className="text-sm text-zinc-500 hover:text-zinc-300">
            Pricing
          </Link>
        </div>
      </header>
      <main className="mx-auto flex max-w-md flex-col px-6 py-12">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-50">{title}</h1>
          {subtitle && <p className="mt-2 text-sm text-zinc-400">{subtitle}</p>}
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-6 shadow-xl shadow-black/20 backdrop-blur">
          {children}
        </div>
        {footer && <div className="mt-6">{footer}</div>}
      </main>
    </div>
  );
}
