-- Restore the layout editor table. IF NOT EXISTS preserves installations that used the
-- pre-migration Arrange-mode branch and already contain saved layouts.
CREATE TABLE IF NOT EXISTS "OfficeLayout" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "isProtected" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OfficeLayout_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "OfficeLayout_workspaceId_isActive_idx"
ON "OfficeLayout"("workspaceId", "isActive");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'OfficeLayout_workspaceId_fkey'
    ) THEN
        ALTER TABLE "OfficeLayout"
        ADD CONSTRAINT "OfficeLayout_workspaceId_fkey"
        FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END
$$;
