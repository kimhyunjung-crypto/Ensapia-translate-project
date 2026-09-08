export function normalizePhrases(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = value.normalize("NFKC").trim();
    const key = normalized.toLocaleLowerCase("und");
    if (!normalized || seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }

  return result;
}

export function appendPhraseText(current: string[], text: string): string[] {
  return normalizePhrases([...current, ...text.split(",")]);
}
