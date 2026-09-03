import type { PrismaClient } from "@prisma/client";
import { decodeEncryptionKey } from "@/lib/crypto";
import { prisma } from "@/lib/database";
import type { TranslationDirection } from "@/lib/language";
import { GlossaryRepository } from "@/modules/glossary/repository";
import { PeopleRepository } from "@/modules/people/repository";
import {
  buildTranslationCondition,
  type AppliedRule,
  type TranslationCondition,
} from "@/modules/rules/engine";
import { ToneRepository } from "@/modules/tone/repository";

export type FirstPassProviderInput = {
  sourceText: string;
  direction: TranslationDirection;
  rules: AppliedRule[];
};

export type FirstPassProviderRequests = {
  openai: {
    provider: "openai";
    input: FirstPassProviderInput;
  };
  gemini: {
    provider: "gemini";
    input: FirstPassProviderInput;
  };
};

function cloneCondition(condition: TranslationCondition): FirstPassProviderInput {
  return structuredClone(condition);
}

export function createFirstPassProviderRequests(
  condition: TranslationCondition,
): FirstPassProviderRequests {
  return {
    openai: {
      provider: "openai",
      input: cloneCondition(condition),
    },
    gemini: {
      provider: "gemini",
      input: cloneCondition(condition),
    },
  };
}

export async function prepareFirstPassProviderRequests(
  sourceText: string,
  direction: TranslationDirection,
  client: PrismaClient = prisma,
  key: Buffer = decodeEncryptionKey(),
): Promise<FirstPassProviderRequests> {
  const [glossary, people, tones] = await Promise.all([
    new GlossaryRepository(client, key).list(),
    new PeopleRepository(client, key).list(),
    new ToneRepository(client, key).list(),
  ]);
  const condition = buildTranslationCondition(sourceText, direction, {
    glossary,
    people,
    tones,
  });

  return createFirstPassProviderRequests(condition);
}
