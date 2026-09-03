import type { PrismaClient } from "@prisma/client";
import { decodeEncryptionKey } from "@/lib/crypto";
import { prisma } from "@/lib/database";
import { GlossaryRepository } from "@/modules/glossary/repository";
import { PeopleRepository } from "@/modules/people/repository";
import { ToneRepository } from "@/modules/tone/repository";
import { TranslationRepository } from "@/modules/translation/repository";

export const DATABASE_TABLE_LABELS = {
  glossaryTerms: "용어",
  people: "인명",
  personAliases: "인식 표현",
  toneRules: "말투",
  promptVersions: "프롬프트 버전",
  modelConfigs: "모델 설정",
  modelPrices: "모델 단가",
  translationJobs: "번역 작업",
  translationOutputs: "번역 출력",
  appliedRuleSnapshots: "적용 규칙 기록",
  apiUsage: "API 사용량",
  operationLogs: "운영 기록",
  deletionLogs: "삭제 기록",
  appSettings: "앱 설정",
} as const;

export type DatabaseTableKey = keyof typeof DATABASE_TABLE_LABELS;

export type DatabaseHealth = {
  connected: true;
  tableCount: number;
  counts: Record<DatabaseTableKey, number>;
  samples: {
    glossary?: string;
    person?: string;
    tone?: string;
    message?: string;
  };
};

export async function getDatabaseHealth(
  client: PrismaClient = prisma,
  key = decodeEncryptionKey(),
): Promise<DatabaseHealth> {
  await client.$queryRaw`SELECT 1`;

  const countEntries = await Promise.all([
    client.glossaryTerm.count(),
    client.person.count(),
    client.personAlias.count(),
    client.toneRule.count(),
    client.promptVersion.count(),
    client.modelConfig.count(),
    client.modelPrice.count(),
    client.translationJob.count(),
    client.translationOutput.count(),
    client.appliedRuleSnapshot.count(),
    client.apiUsage.count(),
    client.operationLog.count(),
    client.deletionLog.count(),
    client.appSetting.count(),
  ]);

  const counts = Object.fromEntries(
    (Object.keys(DATABASE_TABLE_LABELS) as DatabaseTableKey[]).map((name, index) => [
      name,
      countEntries[index],
    ]),
  ) as Record<DatabaseTableKey, number>;

  const glossaryRepository = new GlossaryRepository(client, key);
  const peopleRepository = new PeopleRepository(client, key);
  const toneRepository = new ToneRepository(client, key);
  const translationRepository = new TranslationRepository(client, key);
  const [glossary, person, tone, message] = await Promise.all([
    glossaryRepository.findById("seed-glossary-ontos"),
    peopleRepository.findById("seed-person-ishiwatari"),
    toneRepository.findById("seed-tone-request"),
    translationRepository.findById("seed-job-demo-001"),
  ]);

  return {
    connected: true,
    tableCount: Object.keys(DATABASE_TABLE_LABELS).length,
    counts,
    samples: {
      glossary: glossary ? `${glossary.sourceText} → ${glossary.targetText}` : undefined,
      person: person
        ? `${person.aliases[0] ?? person.koreanCanonical} → ${person.japaneseCanonical}`
        : undefined,
      tone: tone ? `${tone.situation} · ${tone.recommendedTone}` : undefined,
      message: message?.sourceText,
    },
  };
}
