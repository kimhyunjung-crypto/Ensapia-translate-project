import type { TranslationDirection } from "@/lib/language";
import type { GlossaryTermRecord } from "@/modules/glossary/repository";
import type { PersonRecord } from "@/modules/people/repository";
import type { ToneRuleRecord } from "@/modules/tone/repository";

export type PersonAppliedRule = {
  type: "person";
  priority: 1;
  ruleId: string;
  version: 1;
  matchedTexts: string[];
  requiredText: string;
};

export type GlossaryAppliedRule = {
  type: "glossary";
  priority: 2;
  ruleId: string;
  version: 1;
  matchedText: string;
  requiredText: string;
  forbiddenTerms: string[];
};

export type ToneAppliedRule = {
  type: "tone";
  priority: 3;
  ruleId: string;
  version: number;
  situation: string;
  recommendedTone: string;
  cushionPhrases: string[];
  forbiddenPhrases: string[];
};

export type AppliedRule = PersonAppliedRule | GlossaryAppliedRule | ToneAppliedRule;

export type TranslationCondition = {
  sourceText: string;
  direction: TranslationDirection;
  rules: AppliedRule[];
};

type RuleSources = {
  glossary: GlossaryTermRecord[];
  people: PersonRecord[];
  tones: ToneRuleRecord[];
};

type TextSpan = {
  start: number;
  end: number;
};

type PersonCandidate = TextSpan & {
  person: PersonRecord;
  matchedText: string;
};

type GlossaryCandidate = TextSpan & {
  term: GlossaryTermRecord;
  matchedText: string;
};

const SITUATION_PATTERNS: ReadonlyArray<{
  situation: string;
  patterns: readonly string[];
}> = [
  { situation: "요청", patterns: ["부탁", "요청", "주시겠", "いただけ", "お願い"] },
  { situation: "사과", patterns: ["죄송", "미안", "申し訳", "すみません"] },
  { situation: "거절", patterns: ["어렵습니다", "불가", "できません", "難しい"] },
  { situation: "독촉", patterns: ["아직", "재차", "다시 한번", "再度", "まだ"] },
  { situation: "감사", patterns: ["감사", "고맙", "ありがとう"] },
  { situation: "확인", patterns: ["확인", "確認"] },
  { situation: "인사", patterns: ["안녕하세요", "お世話", "こんにちは"] },
];

function findOccurrences(sourceText: string, searchText: string): TextSpan[] {
  if (!searchText) return [];

  const source = sourceText.toLocaleLowerCase();
  const search = searchText.toLocaleLowerCase();
  const spans: TextSpan[] = [];
  let start = 0;

  while (start <= source.length - search.length) {
    const index = source.indexOf(search, start);
    if (index === -1) break;

    spans.push({ start: index, end: index + search.length });
    start = index + Math.max(search.length, 1);
  }

  return spans;
}

function overlaps(candidate: TextSpan, occupied: TextSpan[]): boolean {
  return occupied.some((span) => candidate.start < span.end && span.start < candidate.end);
}

function uniqueTexts(values: string[]): string[] {
  return [...new Set(values)];
}

function personSearchTexts(person: PersonRecord, direction: TranslationDirection): string[] {
  if (direction === "ja-ko") return [person.japaneseCanonical];
  return uniqueTexts([...person.aliases, person.koreanCanonical]);
}

function collectPersonCandidates(
  sourceText: string,
  direction: TranslationDirection,
  people: PersonRecord[],
): PersonCandidate[] {
  return people
    .filter((person) => person.isActive)
    .flatMap((person) =>
      personSearchTexts(person, direction).flatMap((searchText) =>
        findOccurrences(sourceText, searchText).map((span) => ({
          ...span,
          person,
          matchedText: sourceText.slice(span.start, span.end),
        })),
      ),
    )
    .sort((left, right) => {
      const lengthDifference = right.end - right.start - (left.end - left.start);
      return lengthDifference || left.start - right.start || left.person.id.localeCompare(right.person.id);
    });
}

function selectPersonRules(
  sourceText: string,
  direction: TranslationDirection,
  people: PersonRecord[],
): { rules: PersonAppliedRule[]; occupied: TextSpan[] } {
  const occupied: TextSpan[] = [];
  const matchesByPerson = new Map<string, { person: PersonRecord; texts: string[] }>();

  for (const candidate of collectPersonCandidates(sourceText, direction, people)) {
    if (overlaps(candidate, occupied)) continue;

    occupied.push({ start: candidate.start, end: candidate.end });
    const selected = matchesByPerson.get(candidate.person.id) ?? {
      person: candidate.person,
      texts: [],
    };
    selected.texts.push(candidate.matchedText);
    matchesByPerson.set(candidate.person.id, selected);
  }

  return {
    occupied,
    rules: [...matchesByPerson.values()].map(({ person, texts }) => ({
      type: "person",
      priority: 1,
      ruleId: person.id,
      version: 1,
      matchedTexts: uniqueTexts(texts),
      requiredText:
        direction === "ko-ja" ? person.japaneseCanonical : person.koreanCanonical,
    })),
  };
}

function collectGlossaryCandidates(
  sourceText: string,
  direction: TranslationDirection,
  glossary: GlossaryTermRecord[],
): GlossaryCandidate[] {
  return glossary
    .filter((term) => term.isActive && term.direction === direction)
    .flatMap((term) =>
      findOccurrences(sourceText, term.sourceText).map((span) => ({
        ...span,
        term,
        matchedText: sourceText.slice(span.start, span.end),
      })),
    )
    .sort((left, right) => {
      const lengthDifference = right.end - right.start - (left.end - left.start);
      return lengthDifference || left.start - right.start || left.term.id.localeCompare(right.term.id);
    });
}

function selectGlossaryRules(
  sourceText: string,
  direction: TranslationDirection,
  glossary: GlossaryTermRecord[],
  higherPrioritySpans: TextSpan[],
): GlossaryAppliedRule[] {
  const occupied = [...higherPrioritySpans];
  const selected = new Map<string, GlossaryAppliedRule>();

  for (const candidate of collectGlossaryCandidates(sourceText, direction, glossary)) {
    if (overlaps(candidate, occupied)) continue;

    occupied.push({ start: candidate.start, end: candidate.end });
    if (!selected.has(candidate.term.id)) {
      selected.set(candidate.term.id, {
        type: "glossary",
        priority: 2,
        ruleId: candidate.term.id,
        version: 1,
        matchedText: candidate.matchedText,
        requiredText: candidate.term.targetText,
        forbiddenTerms: [...candidate.term.forbiddenTerms],
      });
    }
  }

  return [...selected.values()];
}

function selectToneRule(sourceText: string, tones: ToneRuleRecord[]): ToneAppliedRule | null {
  const activeTones = tones.filter((tone) => tone.isActive);
  const normalizedSource = sourceText.toLocaleLowerCase();
  const detectedSituation = SITUATION_PATTERNS.find(({ situation, patterns }) => {
    const hasRule = activeTones.some((tone) => tone.situation === situation);
    return hasRule && patterns.some((pattern) => normalizedSource.includes(pattern.toLocaleLowerCase()));
  })?.situation;

  const tone = detectedSituation
    ? activeTones.find((candidate) => candidate.situation === detectedSituation)
    : activeTones.find((candidate) =>
        normalizedSource.includes(candidate.situation.toLocaleLowerCase()),
      );

  if (!tone) return null;

  return {
    type: "tone",
    priority: 3,
    ruleId: tone.id,
    version: tone.version,
    situation: tone.situation,
    recommendedTone: tone.recommendedTone,
    cushionPhrases: [...tone.cushionPhrases],
    forbiddenPhrases: [...tone.forbiddenPhrases],
  };
}

export function buildTranslationCondition(
  sourceText: string,
  direction: TranslationDirection,
  sources: RuleSources,
): TranslationCondition {
  const people = selectPersonRules(sourceText, direction, sources.people);
  const glossary = selectGlossaryRules(
    sourceText,
    direction,
    sources.glossary,
    people.occupied,
  );
  const tone = selectToneRule(sourceText, sources.tones);

  return {
    sourceText,
    direction,
    rules: [...people.rules, ...glossary, ...(tone ? [tone] : [])],
  };
}
