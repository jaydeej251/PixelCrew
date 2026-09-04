import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { seedDatabase } from "../src/lib/seed";

/** Load .env then .env.local (local wins). Prisma CLI loads .env only; seed must match Next. */
function loadEnvFile(fileName: string) {
  const path = resolve(process.cwd(), fileName);
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadEnvFile(".env");
loadEnvFile(".env.local");

async function main() {
  const result = await seedDatabase();
  console.log(result.message);
  for (const account of result.accounts) {
    const plan = account.org?.plan ?? "ops-only";
    console.log(`- ${account.kind}: ${account.user.email} (${plan})`);
  }
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => {
    process.exit(process.exitCode ?? 0);
  });
