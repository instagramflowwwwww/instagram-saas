-- Sistema de pastas da biblioteca.
-- Migração aditiva: não remove mídias existentes.

CREATE TABLE IF NOT EXISTS "MediaFolder" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MediaFolder_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "MediaLibrary"
  ADD COLUMN IF NOT EXISTS "folderId" TEXT;

CREATE INDEX IF NOT EXISTS "MediaFolder_userId_name_idx"
  ON "MediaFolder"("userId", "name");

CREATE INDEX IF NOT EXISTS "MediaFolder_userId_createdAt_idx"
  ON "MediaFolder"("userId", "createdAt");

CREATE INDEX IF NOT EXISTS "MediaLibrary_userId_folderId_createdAt_idx"
  ON "MediaLibrary"("userId", "folderId", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'MediaFolder_userId_fkey'
  ) THEN
    ALTER TABLE "MediaFolder"
      ADD CONSTRAINT "MediaFolder_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'MediaLibrary_folderId_fkey'
  ) THEN
    ALTER TABLE "MediaLibrary"
      ADD CONSTRAINT "MediaLibrary_folderId_fkey"
      FOREIGN KEY ("folderId") REFERENCES "MediaFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
