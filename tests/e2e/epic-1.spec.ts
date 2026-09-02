import { expect, test } from "@playwright/test";

test("opens the Focus White translation screen and shows safe setup guidance", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveURL(/\/translate$/);
  await expect(page.getByRole("img", { name: "ENSAPIA" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "비즈니스 메시지 번역" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Slack 메시지를 입력하세요" })).toBeVisible();
  await expect(page.getByTestId("setup-notice")).toContainText("AI 연결 준비가 필요합니다");
  await expect(page.getByText("openai-secret-value")).toHaveCount(0);

  const primaryPreview = page.getByText("번역하기", { exact: false }).first();
  await expect(primaryPreview).toHaveCSS("background-color", "rgb(41, 81, 218)");
});

test("moves through all four work areas from the top navigation", async ({ page }) => {
  await page.goto("/translate");

  const routes = [
    { name: "용어집", path: "/glossary", heading: "ENSAPIA 용어집" },
    { name: "인명·호칭", path: "/people", heading: "인명·호칭 기준" },
    { name: "운영 설정", path: "/settings", heading: "운영 설정" },
    { name: "번역", path: "/translate", heading: "Slack 메시지를 입력하세요" },
  ];

  for (const route of routes) {
    const menuLink = page
      .getByRole("navigation", { name: "주요 메뉴" })
      .getByRole("link", { name: route.name, exact: true });

    await menuLink.click();
    await expect(page).toHaveURL(new RegExp(`${route.path}$`));
    await expect(page.getByRole("heading", { name: route.heading }).last()).toBeVisible();
    await expect(menuLink).toHaveAttribute("aria-current", "page");
  }
});

test("keeps the navigation usable on a compact screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/translate");

  await expect(page.getByRole("navigation", { name: "주요 메뉴" })).toBeVisible();
  await expect(page.getByRole("link", { name: "운영 설정" })).toBeVisible();
  await expect(page.getByLabel("번역 작업 영역")).toBeVisible();
});

test("returns only safe readiness fields", async ({ request }) => {
  const response = await request.get("/api/readiness");
  expect(response.ok()).toBe(true);

  const body = await response.json();
  expect(body).toEqual({
    ok: true,
    localOnly: true,
    environment: {
      ready: false,
      missing: ["OPENAI_API_KEY", "GEMINI_API_KEY", "DATA_ENCRYPTION_KEY"],
      dataMode: "demo",
    },
  });
});
