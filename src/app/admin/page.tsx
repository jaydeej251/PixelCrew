import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { isPlatformOps } from "@/lib/platform-admin";
import { AdminConsole } from "@/components/admin/admin-console";
import { AdminSignOutButton } from "@/components/admin/admin-sign-out";

export default async function AdminPage() {
  const session = await getSession();
  if (!session) redirect("/login?from=/admin");
  if (!isPlatformOps(session.platformRole)) redirect("/app");

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 px-6 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-zinc-500">Platform</p>
            <h1 className="text-lg font-semibold">Admin</h1>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-zinc-500">{session.email}</span>
            <Link href="/account" className="text-zinc-300 hover:text-white">
              Account
            </Link>
            <AdminSignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">
        <p className="mb-6 text-sm text-zinc-400">
          Ops console for the whole product — tenants, plans, stuck runs, and sessions. This is not
          the office floor; operators do not run CEO prompts here.
        </p>
        <AdminConsole />
      </main>
    </div>
  );
}
