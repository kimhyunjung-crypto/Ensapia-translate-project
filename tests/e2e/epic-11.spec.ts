import { expect, test } from "@playwright/test";

const sourceText = "안녕하세요. 회의 일정을 확인 부탁드립니다.";
const expectedText = "こんにちは。会議の日程をご確認いただけますでしょうか。";

test("shows the integrated flow result, 50 quality cases, and PRD checklist", async ({ page }) => {
  await page.goto("/translate");
  await page.getByLabel("원문").fill(sourceText);
  await page.getByRole("button", { name: "번역하기" }).click();
  await expect(page.getByTestId("final-translation")).toHaveText(expectedText);

  await page.getByRole("link", { name: "용어집", exact: true }).click();
  await expect(page.getByRole("heading", { name: "등록 용어" })).toBeVisible();
  await expect(page.getByText("Ontos", { exact: true }).first()).toBeVisible();

  await page.getByRole("link", { name: "인명·호칭", exact: true }).click();
  await expect(page.getByRole("heading", { name: "등록된 인명·호칭" })).toBeVisible();

  await page.getByRole("link", { name: "운영 설정", exact: true }).click();
  await expect(page.getByRole("heading", { name: "AI와 데이터 운영" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "상황별 말투 규칙" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "전체 품질과 완료 점검" })).toBeVisible();

  const integration = page.getByTestId("integration-checks");
  await expect(integration.getByText("양방향 번역", { exact: true })).toBeVisible();
  await expect(integration.getByText("회사 용어", { exact: true })).toBeVisible();
  await expect(integration.getByText("인명·호칭", { exact: true })).toBeVisible();
  await expect(integration.getByText("상황별 말투", { exact: true })).toBeVisible();
  await expect(integration.getByText("AI·비용 운영", { exact: true })).toBeVisible();
  await expect(integration.getByText("기간별 영구 삭제", { exact: true })).toBeVisible();

  await expect(page.getByText("50/50 통과", { exact: true })).toBeVisible();
  await expect(page.getByText("한국어 → 일본어").last()).toBeVisible();
  await expect(page.getByText("일본어 → 한국어").last()).toBeVisible();
  await expect(page.getByTestId("quality-evaluation-row")).toHaveCount(50);
  await expect(page.getByTestId("quality-evaluation-table").getByText("통과", { exact: true })).toHaveCount(50);

  const prd = page.getByTestId("prd-checklist");
  await expect(prd.getByRole("heading", { name: "네 화면" })).toBeVisible();
  await expect(prd.getByRole("heading", { name: "핵심 기능" })).toBeVisible();
  await expect(prd.getByRole("heading", { name: "MVP 제외 범위 준수" })).toBeVisible();
  await expect(prd.getByRole("heading", { name: "성공 기준" })).toBeVisible();
  await expect(prd.locator('[data-status="pending-operation"]')).toHaveCount(2);
});

test("keeps translation cards side by side on PC and stacks them on a narrow screen", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/translate");
  const source = page.locator(".source-card");
  const action = page.locator(".translate-action-wrap");
  const result = page.locator(".result-card");
  const [desktopSource, desktopAction, desktopResult] = await Promise.all([
    source.boundingBox(),
    action.boundingBox(),
    result.boundingBox(),
  ]);

  expect(desktopSource).not.toBeNull();
  expect(desktopAction).not.toBeNull();
  expect(desktopResult).not.toBeNull();
  expect(desktopSource!.x).toBeLessThan(desktopAction!.x);
  expect(desktopAction!.x).toBeLessThan(desktopResult!.x);
  expect(Math.abs(desktopSource!.y - desktopResult!.y)).toBeLessThan(4);

  await page.setViewportSize({ width: 390, height: 844 });
  const [mobileSource, mobileAction, mobileResult] = await Promise.all([
    source.boundingBox(),
    action.boundingBox(),
    result.boundingBox(),
  ]);
  expect(mobileSource).not.toBeNull();
  expect(mobileAction).not.toBeNull();
  expect(mobileResult).not.toBeNull();
  expect(mobileSource!.y).toBeLessThan(mobileAction!.y);
  expect(mobileAction!.y).toBeLessThan(mobileResult!.y);
});

test("supports the main translation flow with keyboard only", async ({ page }) => {
  await page.goto("/translate");

  await page.keyboard.press("Tab");
  const skipLink = page.getByRole("link", { name: "본문으로 바로가기" });
  await expect(skipLink).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();

  await page.keyboard.press("Tab");
  await expect(page.getByLabel("원문")).toBeFocused();
  await page.keyboard.type(sourceText);
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "번역하기" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("final-translation")).toHaveText(expectedText);
});
