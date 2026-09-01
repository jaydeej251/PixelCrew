import { seedDatabase } from "../src/lib/seed";

async function main() {
  const result = await seedDatabase();
  console.log("Seeded:", result.workspace?.name);
}

main()
  .catch(console.error)
  .finally(() => process.exit(0));
