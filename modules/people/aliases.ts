export function normalizeAlias(value: string): string {
  return value.normalize("NFKC").trim();
}

function aliasKey(value: string): string {
  return normalizeAlias(value).toLocaleLowerCase("und");
}

export function normalizeAliases(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = normalizeAlias(value);
    const key = aliasKey(normalized);
    if (!normalized || seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }

  return result;
}

export function appendAliasText(current: string[], text: string): string[] {
  return normalizeAliases([...current, ...text.split(",")]);
}
