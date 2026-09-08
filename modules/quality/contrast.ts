export type ContrastPair = {
  label: string;
  foreground: string;
  background: string;
  minimum: number;
};

function channelToLinear(channel: number): number {
  const normalized = channel / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hexColor: string): number {
  const normalized = hexColor.replace(/^#/u, "");
  if (!/^[0-9a-f]{6}$/iu.test(normalized)) {
    throw new Error(`6자리 HEX 색상이 필요합니다: ${hexColor}`);
  }

  const channels = [0, 2, 4].map((offset) =>
    channelToLinear(Number.parseInt(normalized.slice(offset, offset + 2), 16)),
  );
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

export function contrastRatio(foreground: string, background: string): number {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

export const CORE_CONTRAST_PAIRS: readonly ContrastPair[] = [
  { label: "기본 본문", foreground: "#172033", background: "#ffffff", minimum: 4.5 },
  { label: "보조 본문", foreground: "#677084", background: "#ffffff", minimum: 4.5 },
  { label: "주요 버튼", foreground: "#ffffff", background: "#2951da", minimum: 4.5 },
  { label: "오류 안내", foreground: "#b42318", background: "#ffffff", minimum: 4.5 },
  { label: "정보 안내", foreground: "#405489", background: "#f5f7ff", minimum: 4.5 },
  { label: "주의 안내", foreground: "#805b1d", background: "#fff7e8", minimum: 4.5 },
];
