import { expect, test } from "@playwright/test";

const koreanSource = "안녕하세요. 회의 일정을 확인 부탁드립니다.";
const japaneseResult = "こんにちは。会議の日程をご確認いただけますでしょうか。";

test("accepts multiline Korean input, shows progress, one final result, and copies it", async ({
  context,
  page,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: "http://127.0.0.1:3000",
  });
  await page.goto("/translate");

  const source = page.getByLabel("원문");
  await source.fill(koreanSource);
  await expect(page.getByTestId("translation-direction")).toHaveText("한국어 → 일본어");
  await expect(page.getByText(`${[...koreanSource].length} / 3,000자`)).toBeVisible();

  await page.getByRole("button", { name: "번역하기" }).click();
  await expect(page.getByRole("button", { name: "번역 중" })).toBeDisabled();
  await expect(page.getByTestId("final-translation")).toHaveText(japaneseResult);
  await expect(page.locator(".result-card").getByText(/OpenAI|Gemini|GPT/)).toHaveCount(0);

  await page.getByRole("button", { name: "복사", exact: true }).click();
  await expect(page.getByRole("button", { name: "복사됨" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(japaneseResult);
});

test("detects Japanese and returns a Korean final result", async ({ page }) => {
  await page.goto("/translate");
  await page.getByLabel("원문").fill("お世話になっております。資料をご確認ください。");

  await expect(page.getByTestId("translation-direction")).toHaveText("일본어 → 한국어");
  await page.getByRole("button", { name: "번역하기" }).click();
  await expect(page.getByTestId("final-translation")).toHaveText("안녕하세요. 자료를 확인해 주세요.");
  await expect(page.locator(".result-card").getByText("한국어", { exact: true })).toBeVisible();
});

test("blocks empty and over-limit input before making a request", async ({ page }) => {
  let translationRequests = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/api/translate")) translationRequests += 1;
  });
  await page.goto("/translate");

  await page.getByRole("button", { name: "번역하기" }).click();
  await expect(page.getByText("번역할 문장을 입력해 주세요.")).toBeVisible();

  await page.getByLabel("원문").fill("가".repeat(3_001));
  await expect(page.getByText("3,001 / 3,000자")).toBeVisible();
  await expect(page.getByText("현재 3,001자입니다. 최대 3,000자까지 입력할 수 있습니다.")).toBeVisible();
  await page.getByRole("button", { name: "번역하기" }).click();
  await expect(
    page.getByText("번역할 문장은 공백과 줄바꿈을 포함해 3,000자 이내로 입력해 주세요."),
  ).toBeVisible();
  expect(translationRequests).toBe(0);
});

test("keeps the source after failure and succeeds when retried", async ({ page }) => {
  let shouldFail = true;
  await page.route("**/api/translate", async (route) => {
    if (shouldFail) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          ok: false,
          error: { code: "DEMO_FAILURE", message: "번역 연결이 잠시 불안정합니다." },
        }),
      });
      return;
    }
    await route.continue();
  });
  await page.goto("/translate");
  const source = page.getByLabel("원문");
  await source.fill(koreanSource);

  await page.getByRole("button", { name: "번역하기" }).click();
  await expect(page.getByRole("heading", { name: "번역을 완료하지 못했습니다" })).toBeVisible();
  await expect(page.getByText("번역 연결이 잠시 불안정합니다.")).toBeVisible();
  await expect(source).toHaveValue(koreanSource);
  await expect(page.getByRole("button", { name: "다시 시도" })).toBeVisible();

  shouldFail = false;
  await page.getByRole("button", { name: "다시 시도" }).click();
  await expect(page.getByTestId("final-translation")).toHaveText(japaneseResult);
});
