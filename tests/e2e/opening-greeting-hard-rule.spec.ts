import { expect, test } from "@playwright/test";

test("shows and enforces the opening greeting hard rule in both directions", async ({ page }) => {
  await page.goto("/settings");
  const hardRule = page.getByTestId("tone-hard-rule");
  await expect(hardRule).toContainText("첫인사");
  await expect(hardRule).toContainText("필수 규칙 · HARD RULE");
  await expect(hardRule).toContainText("최우선");
  await expect(hardRule).toContainText("사용 중");
  await expect(hardRule).toContainText("お疲れ様です。");
  await expect(hardRule).toContainText("안녕하세요.");

  await page.goto("/translate");
  const source = page.getByLabel("원문");
  await source.fill("안녕하세요. 자료 확인을 부탁드립니다.");
  await page.getByRole("button", { name: "번역하기" }).click();
  await expect(page.getByTestId("final-translation")).toHaveText(/^お疲れ様です。/u);

  await source.fill("お疲れ様です！資料をご確認ください。");
  await page.getByRole("button", { name: "번역하기" }).click();
  await expect(page.getByTestId("final-translation")).toHaveText(/^안녕하세요\./u);

  await source.fill("회의 중간에 안녕하세요.라고 인사했습니다.");
  await page.getByRole("button", { name: "번역하기" }).click();
  await expect(page.getByTestId("final-translation")).not.toHaveText(/^お疲れ様です。/u);
});
