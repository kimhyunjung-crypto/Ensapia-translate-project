import { glossaryFormInputSchema, type GlossaryFormInput } from "@/lib/validation";

export const GLOSSARY_CSV_HEADERS = [
  "sourceText",
  "targetText",
  "direction",
  "description",
  "forbiddenTerms",
  "isActive",
] as const;

export const GLOSSARY_CSV_TEMPLATE = `\uFEFF${GLOSSARY_CSV_HEADERS.join(",")}\r\n` +
  'Ontos,"Ontos（IAM）",ko-ja,사내 서비스명,온토스|オントス,true\r\n' +
  '確認,확인,ja-ko,업무 확인 표현,,true\r\n';

export type GlossaryCsvRow = {
  rowNumber: number;
  value: GlossaryFormInput;
};

export type GlossaryCsvError = {
  rowNumber: number;
  reason: string;
};

export type GlossaryCsvParseResult = {
  rows: GlossaryCsvRow[];
  errors: GlossaryCsvError[];
};

export class GlossaryCsvFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GlossaryCsvFormatError";
  }
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        cell += character;
      }
      continue;
    }

    if (character === '"' && cell.length === 0) {
      quoted = true;
    } else if (character === ",") {
      row.push(cell);
      cell = "";
    } else if (character === "\n") {
      row.push(cell.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }

  if (quoted) throw new GlossaryCsvFormatError("닫히지 않은 큰따옴표가 있습니다.");
  if (cell.length > 0 || row.length > 0) {
    row.push(cell.replace(/\r$/, ""));
    rows.push(row);
  }

  return rows;
}

function parseActive(value: string): boolean | null {
  const normalized = value.normalize("NFKC").trim().toLocaleLowerCase("und");
  if (["", "true", "1", "활성", "사용"].includes(normalized)) return true;
  if (["false", "0", "비활성", "중지"].includes(normalized)) return false;
  return null;
}

function duplicateKey(value: GlossaryFormInput): string {
  return `${value.direction}\0${value.sourceText.normalize("NFKC").trim().toLocaleLowerCase("und")}`;
}

export function parseGlossaryCsv(text: string): GlossaryCsvParseResult {
  const parsedRows = parseCsv(text.replace(/^\uFEFF/, ""));
  if (parsedRows.length === 0) {
    throw new GlossaryCsvFormatError("CSV 파일이 비어 있습니다.");
  }

  const headers = parsedRows[0].map((header) => header.trim());
  if (headers.join("\0") !== GLOSSARY_CSV_HEADERS.join("\0")) {
    throw new GlossaryCsvFormatError(
      `첫 행의 열 이름과 순서를 확인해 주세요: ${GLOSSARY_CSV_HEADERS.join(", ")}`,
    );
  }

  const dataRows = parsedRows.slice(1).filter((cells) => cells.some((cell) => cell.trim()));
  if (dataRows.length > 500) {
    throw new GlossaryCsvFormatError("한 파일에는 최대 500개 용어를 가져올 수 있습니다.");
  }

  const rows: GlossaryCsvRow[] = [];
  const errors: GlossaryCsvError[] = [];
  const seen = new Map<string, number>();

  for (const [index, cells] of dataRows.entries()) {
    const rowNumber = index + 2;
    if (cells.length !== GLOSSARY_CSV_HEADERS.length) {
      errors.push({
        rowNumber,
        reason: `열이 ${cells.length}개입니다. ${GLOSSARY_CSV_HEADERS.length}개 열이 필요합니다.`,
      });
      continue;
    }

    const isActive = parseActive(cells[5]);
    if (isActive === null) {
      errors.push({
        rowNumber,
        reason: "isActive는 true/false, 1/0, 활성/비활성 중 하나여야 합니다.",
      });
      continue;
    }

    const parsed = glossaryFormInputSchema.safeParse({
      sourceText: cells[0],
      targetText: cells[1],
      direction: cells[2].trim(),
      description: cells[3].trim() || undefined,
      forbiddenTerms: [...new Set(cells[4].split("|").map((term) => term.trim()).filter(Boolean))],
      isActive,
    });
    if (!parsed.success) {
      errors.push({
        rowNumber,
        reason: parsed.error.issues.map((issue) => issue.message).join(" "),
      });
      continue;
    }

    const key = duplicateKey(parsed.data);
    const earlierRow = seen.get(key);
    if (earlierRow) {
      errors.push({ rowNumber, reason: `${earlierRow}행과 같은 원어·번역 방향입니다.` });
      continue;
    }

    seen.set(key, rowNumber);
    rows.push({ rowNumber, value: parsed.data });
  }

  return { rows, errors };
}
