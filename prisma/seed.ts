import { seedDatabase } from "../src/lib/seed";

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
