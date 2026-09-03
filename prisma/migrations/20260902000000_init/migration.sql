-- CreateTable
CREATE TABLE "glossary_terms" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source_text_enc" TEXT NOT NULL,
    "source_fingerprint" TEXT NOT NULL,
    "target_text_enc" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "description_enc" TEXT,
    "forbidden_terms_enc" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "used_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

CREATE TABLE "people" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "japanese_canonical_enc" TEXT NOT NULL,
    "korean_canonical_enc" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "used_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

CREATE TABLE "person_aliases" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "person_id" TEXT NOT NULL,
    "alias_enc" TEXT NOT NULL,
    "alias_fingerprint" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "person_aliases_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "tone_rules" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "situation" TEXT NOT NULL,
    "recommended_tone_enc" TEXT NOT NULL,
    "cushion_phrases_enc" TEXT,
    "forbidden_phrases_enc" TEXT,
    "example_enc" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "used_count" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

CREATE TABLE "prompt_versions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "model_configs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "model_id" TEXT NOT NULL,
    "settings" TEXT NOT NULL DEFAULT '{}',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "effective_from" DATETIME NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

CREATE TABLE "model_prices" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL,
    "model_id" TEXT NOT NULL,
    "input_price_per_million" REAL NOT NULL,
    "output_price_per_million" REAL NOT NULL,
    "effective_from" DATETIME NOT NULL,
    "effective_to" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "translation_jobs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source_language" TEXT NOT NULL,
    "target_language" TEXT NOT NULL,
    "source_text_enc" TEXT NOT NULL,
    "final_text_enc" TEXT,
    "status" TEXT NOT NULL,
    "prompt_version_ids" TEXT NOT NULL DEFAULT '[]',
    "started_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" DATETIME
);

CREATE TABLE "translation_outputs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "job_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "output_text_enc" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "latency_ms" INTEGER,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "translation_outputs_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "translation_jobs" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "applied_rule_snapshots" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "job_id" TEXT NOT NULL,
    "rule_type" TEXT NOT NULL,
    "rule_id" TEXT,
    "rule_version" INTEGER NOT NULL,
    "snapshot_enc" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "applied_rule_snapshots_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "translation_jobs" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "api_usage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "job_id" TEXT,
    "provider" TEXT NOT NULL,
    "model_id" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "input_tokens" INTEGER NOT NULL,
    "output_tokens" INTEGER NOT NULL,
    "estimated_cost_usd" REAL NOT NULL,
    "occurred_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "api_usage_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "translation_jobs" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "operation_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "category" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "target_type" TEXT,
    "target_id" TEXT,
    "result" TEXT NOT NULL,
    "error_code" TEXT,
    "safe_message" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "deletion_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date_from" DATETIME NOT NULL,
    "date_to" DATETIME NOT NULL,
    "deleted_job_count" INTEGER NOT NULL,
    "deleted_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "app_settings" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value_json" TEXT NOT NULL,
    "updated_at" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "glossary_terms_source_fingerprint_key" ON "glossary_terms"("source_fingerprint");
CREATE INDEX "idx_glossary_terms_direction_active" ON "glossary_terms"("direction", "is_active");
CREATE INDEX "idx_people_active" ON "people"("is_active");
CREATE UNIQUE INDEX "person_aliases_alias_fingerprint_key" ON "person_aliases"("alias_fingerprint");
CREATE INDEX "idx_person_aliases_person_id" ON "person_aliases"("person_id");
CREATE UNIQUE INDEX "tone_rules_situation_key" ON "tone_rules"("situation");
CREATE INDEX "idx_tone_rules_active" ON "tone_rules"("is_active");
CREATE INDEX "idx_prompt_versions_provider_stage_active" ON "prompt_versions"("provider", "stage", "is_active");
CREATE UNIQUE INDEX "prompt_versions_provider_stage_version_key" ON "prompt_versions"("provider", "stage", "version");
CREATE INDEX "idx_model_configs_provider_stage_active" ON "model_configs"("provider", "stage", "is_active");
CREATE UNIQUE INDEX "model_configs_provider_stage_effective_key" ON "model_configs"("provider", "stage", "effective_from");
CREATE INDEX "idx_model_prices_lookup" ON "model_prices"("provider", "model_id", "effective_from");
CREATE UNIQUE INDEX "model_prices_provider_model_effective_key" ON "model_prices"("provider", "model_id", "effective_from");
CREATE INDEX "idx_translation_jobs_started_at" ON "translation_jobs"("started_at");
CREATE INDEX "idx_translation_jobs_status" ON "translation_jobs"("status");
CREATE INDEX "idx_translation_outputs_job_id" ON "translation_outputs"("job_id");
CREATE UNIQUE INDEX "translation_outputs_job_stage_attempt_key" ON "translation_outputs"("job_id", "provider", "stage", "attempt");
CREATE INDEX "idx_applied_rule_snapshots_job_id" ON "applied_rule_snapshots"("job_id");
CREATE INDEX "idx_applied_rule_snapshots_rule" ON "applied_rule_snapshots"("rule_type", "rule_id");
CREATE INDEX "idx_api_usage_job_id" ON "api_usage"("job_id");
CREATE INDEX "idx_api_usage_occurred_at" ON "api_usage"("occurred_at");
CREATE INDEX "idx_api_usage_provider_model" ON "api_usage"("provider", "model_id");
CREATE INDEX "idx_operation_logs_category_created" ON "operation_logs"("category", "created_at");
CREATE INDEX "idx_deletion_logs_deleted_at" ON "deletion_logs"("deleted_at");
