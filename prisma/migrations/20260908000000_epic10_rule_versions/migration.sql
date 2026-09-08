-- Track the exact glossary and person rule revision applied to each translation.
ALTER TABLE "glossary_terms" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "people" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
