import type { ProviderType, PrismaClient, Prisma } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

type CredentialRow = {
  id: string;
  workspaceId: string;
  provider: ProviderType;
  label: string;
  encryptedKey: string | null;
  baseUrl: string | null;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Picks one credential for a provider.
 * Order: marked default first, then most recently updated.
 * Callers must not assume insertion order when multiple rows exist.
 */
export async function findProviderCredential(
  db: Db,
  workspaceId: string,
  provider: ProviderType,
): Promise<CredentialRow | null> {
  return db.providerCredential.findFirst({
    where: { workspaceId, provider },
    orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }, { createdAt: "desc" }],
  });
}

/** Marks one credential as the active default for its provider within the workspace. */
export async function setDefaultProviderCredential(
  prisma: PrismaClient,
  credentialId: string,
): Promise<CredentialRow> {
  const target = await prisma.providerCredential.findUniqueOrThrow({
    where: { id: credentialId },
  });
  return prisma.$transaction(async (tx) => {
    await tx.providerCredential.updateMany({
      where: {
        workspaceId: target.workspaceId,
        provider: target.provider,
        NOT: { id: target.id },
      },
      data: { isDefault: false },
    });
    return tx.providerCredential.update({
      where: { id: target.id },
      data: { isDefault: true },
    });
  });
}
