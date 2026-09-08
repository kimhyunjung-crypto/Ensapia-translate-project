const SEOUL_OFFSET_MS = 9 * 60 * 60 * 1_000;
const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export type DateRange = {
  start: Date;
  endExclusive: Date;
};

export function isValidDateOnly(value: string): boolean {
  const match = DATE_ONLY_PATTERN.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function dateParts(value: string): [number, number, number] {
  if (!isValidDateOnly(value)) throw new RangeError("올바른 날짜를 입력해 주세요.");
  const [, year, month, day] = DATE_ONLY_PATTERN.exec(value)!;
  return [Number(year), Number(month), Number(day)];
}

export function seoulDateRange(dateFrom: string, dateTo: string): DateRange {
  const [fromYear, fromMonth, fromDay] = dateParts(dateFrom);
  const [toYear, toMonth, toDay] = dateParts(dateTo);
  const start = new Date(Date.UTC(fromYear, fromMonth - 1, fromDay) - SEOUL_OFFSET_MS);
  const endExclusive = new Date(Date.UTC(toYear, toMonth - 1, toDay + 1) - SEOUL_OFFSET_MS);
  if (start >= endExclusive) throw new RangeError("시작일은 종료일보다 늦을 수 없습니다.");
  return { start, endExclusive };
}

export function seoulUsageRanges(now = new Date()): { today: DateRange; month: DateRange } {
  const seoulNow = new Date(now.getTime() + SEOUL_OFFSET_MS);
  const year = seoulNow.getUTCFullYear();
  const month = seoulNow.getUTCMonth();
  const day = seoulNow.getUTCDate();
  return {
    today: {
      start: new Date(Date.UTC(year, month, day) - SEOUL_OFFSET_MS),
      endExclusive: new Date(Date.UTC(year, month, day + 1) - SEOUL_OFFSET_MS),
    },
    month: {
      start: new Date(Date.UTC(year, month, 1) - SEOUL_OFFSET_MS),
      endExclusive: new Date(Date.UTC(year, month + 1, 1) - SEOUL_OFFSET_MS),
    },
  };
}

export function seoulDateInput(now = new Date()): string {
  const seoulNow = new Date(now.getTime() + SEOUL_OFFSET_MS);
  return [
    seoulNow.getUTCFullYear(),
    String(seoulNow.getUTCMonth() + 1).padStart(2, "0"),
    String(seoulNow.getUTCDate()).padStart(2, "0"),
  ].join("-");
}
