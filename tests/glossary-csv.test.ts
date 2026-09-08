// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  GLOSSARY_CSV_HEADERS,
  GlossaryCsvFormatError,
  parseGlossaryCsv,
} from "@/modules/glossary/csv";

describe("EPIC 6 glossary CSV validation", () => {
  it("parses quoted cells, forbidden terms, and inactive state", () => {
    const csv = [
      GLOSSARY_CSV_HEADERS.join(","),
      '"Demo,Flow",DemoFlow（検証）,ko-ja,"쉼표, 포함 설명",데모|デモ,false',
    ].join("\r\n");

    expect(parseGlossaryCsv(csv)).toEqual({
      rows: [
        {
          rowNumber: 2,
          value: {
            sourceText: "Demo,Flow",
            targetText: "DemoFlow（検証）",
            direction: "ko-ja",
            description: "쉼표, 포함 설명",
            forbiddenTerms: ["데모", "デモ"],
            isActive: false,
          },
        },
      ],
      errors: [],
    });
  });

  it("reports missing required values, invalid state, and duplicate row numbers", () => {
    const csv = [
      GLOSSARY_CSV_HEADERS.join(","),
      "Alpha,アルファ,ko-ja,,,true",
      "alpha,別表記,ko-ja,,,true",
      ",권장 표기,ko-ja,,,true",
      "Beta,ベータ,ko-ja,,,sometimes",
    ].join("\n");
    const result = parseGlossaryCsv(csv);

    expect(result.rows).toHaveLength(1);
    expect(result.errors).toEqual([
      { rowNumber: 3, reason: "2행과 같은 원어·번역 방향입니다." },
      { rowNumber: 4, reason: "원어: 내용을 입력해 주세요." },
      {
        rowNumber: 5,
        reason: "isActive는 true/false, 1/0, 활성/비활성 중 하나여야 합니다.",
      },
    ]);
  });

  it("rejects a file whose header does not match the template", () => {
    expect(() => parseGlossaryCsv("source,target\nA,B")).toThrow(GlossaryCsvFormatError);
    expect(() => parseGlossaryCsv("source,target\nA,B")).toThrow("첫 행의 열 이름과 순서");
  });
});
