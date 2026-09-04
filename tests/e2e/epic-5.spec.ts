import { expect, test } from "@playwright/test";

test("returns only the final result after the five-stage demo pipeline", async ({ request }) => {
  const response = await request.post("/api/translate", {
    data: {
      sourceText: "이시와타리 대표님, Ontos 연습 계정 권한 확인을 부탁드립니다.",
    },
  });
  const body = await response.json();
  const serialized = JSON.stringify(body);

  expect(response.ok()).toBe(true);
  expect(body.translation.finalText).toBe(
    "石渡さん、Ontos（IAM）の練習用アカウント権限をご確認いただけますでしょうか。",
  );
  expect(serialized).not.toMatch(/drafts|reviews|rules|promptVersion|modelId|openai|gemini|gpt/i);
});

test("shows a quality-check reason without discarding the source", async ({ page }) => {
  const sourceText = "요청 번호는 2026입니다.";
  const qualityMessage = "최종 번역에서 원문의 숫자가 누락되었습니다. 다시 시도해 주세요.";
  await page.route("**/api/translate", async (route) => {
    await route.fulfill({
      status: 422,
      contentType: "application/json",
      body: JSON.stringify({
        ok: false,
        error: { code: "NUMBER_MISSING", message: qualityMessage },
      }),
    });
  });
  await page.goto("/translate");
  const source = page.getByLabel("원문");
  await source.fill(sourceText);
  await page.getByRole("button", { name: "번역하기" }).click();

  await expect(page.getByRole("heading", { name: "번역을 완료하지 못했습니다" })).toBeVisible();
  await expect(page.getByText(qualityMessage)).toBeVisible();
  await expect(source).toHaveValue(sourceText);
  await expect(page.getByRole("button", { name: "다시 시도" })).toBeVisible();
});
