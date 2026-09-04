import { redirect } from "next/navigation";
import { Dashboard } from "@/components/dashboard";
import { getSession } from "@/lib/auth";
import { isPlatformOps } from "@/lib/platform-admin";

export default async function AppPage() {
  const session = await getSession();
  if (!session) redirect("/login?from=/app");
  if (isPlatformOps(session.platformRole)) redirect("/admin");

  return <Dashboard />;
}
