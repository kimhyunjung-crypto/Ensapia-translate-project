import { expect, test } from "@playwright/test";

test("shows the connected database, all table counts, and fake seed samples", async ({ page }) => {
  await page.goto("/settings");

  await expect(page.getByRole("heading", { name: "데이터 연결 성공" })).toBeVisible();
  await expect(page.getByText("14개 데이터 표")).toBeVisible();
  await expect(page.getByText("Ontos → Ontos（IAM）")).toBeVisible();
  await expect(page.getByText(/이시와타리 대표님 → 石渡さん/)).toBeVisible();
  await expect(page.getByText("실제 개인정보가 아닙니다", { exact: false })).toBeVisible();
  await expect(page.getByText("API 사용량")).toBeVisible();
  await expect(page.getByText("삭제 기록")).toBeVisible();
});

test("database health API returns counts and decrypted fake samples without key material", async ({ request }) => {
  const response = await request.get("/api/system/database-status");
  expect(response.ok()).toBe(true);

  const body = await response.json();
  expect(body.ok).toBe(true);
  expect(body.database.connected).toBe(true);
  expect(body.database.tableCount).toBe(14);
  expect(body.database.samples.glossary).toContain("Ontos");
  expect(JSON.stringify(body)).not.toContain("DATA_ENCRYPTION_KEY");
  expect(JSON.stringify(body)).not.toMatch(/[a-f0-9]{64}/i);
});

test("validation API rejects bad input without returning source text or secrets", async ({ request }) => {
  const rejectedSource = `OPENAI_API_KEY=should-never-return-${"가".repeat(3_001)}`;
  const response = await request.post("/api/system/validation-check", {
    data: { sourceText: rejectedSource },
  });
  const body = await response.json();

  expect(response.status()).toBe(400);
  expect(body.error.code).toBe("INVALID_INPUT");
  expect(body.error.message).toBe("입력 내용을 확인해 주세요.");
  expect(JSON.stringify(body)).not.toContain(rejectedSource);
  expect(JSON.stringify(body)).not.toContain("should-never-return");
});
