import { expect, test, type APIRequestContext } from "@playwright/test";

async function deleteUnusedBySituation(request: APIRequestContext, situation: string) {
  const response = await request.get("/api/tone-rules");
  if (!response.ok()) return;
  const body = await response.json();
  const rule = body.rules?.find((item: { situation?: string }) => item.situation === situation);
  if (rule?.id && rule.usedCount === 0) await request.delete(`/api/tone-rules/${rule.id}`);
}

test("manages tone rules with phrase tags, persistence, history, validation, and status", async ({
  page,
  request,
}, testInfo) => {
  const suffix = `${testInfo.workerIndex}${Date.now()}`;
  const situation = `회신${suffix}`;
  const cushion = `검토해 주셔서${suffix}`;
  const removedCushion = `참고로${suffix}`;
  const forbidden = `빨리${suffix}`;

  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "상황별 말투 규칙" })).toBeVisible();

  try {
    await page.getByRole("button", { name: "+ 새 말투", exact: true }).click();
    const editor = page.getByRole("dialog", { name: "새 말투 규칙" });
    await editor.getByLabel(/상황/).fill(situation);
    await editor.getByLabel(/권장 어조/).fill("상대를 배려하는 정중한 회신 어조");

    const cushionInput = editor.getByLabel("쿠션어 입력");
    await cushionInput.fill(cushion);
    await cushionInput.press("Enter");
    await cushionInput.fill(`${removedCushion},추가 쿠션${suffix},`);
    const removeCushionButton = editor.getByRole("button", { name: `${removedCushion} 삭제` });
    await expect(removeCushionButton).toBeVisible();
    await removeCushionButton.click();
    await expect(removeCushionButton).toHaveCount(0);

    const forbiddenInput = editor.getByLabel("금지 표현 입력");
    await forbiddenInput.fill(forbidden);
    await forbiddenInput.press("Enter");
    await editor.getByLabel("예문").fill("검토해 주셔서 감사합니다. 아래 내용으로 회신드립니다.");
    await editor.getByRole("button", { name: "저장", exact: true }).click();

    const search = page.getByRole("searchbox", { name: "말투 규칙 검색" });
    await search.fill(situation);
    const card = page.getByTestId("tone-card").filter({ hasText: situation });
    await expect(card).toContainText("상대를 배려하는 정중한 회신 어조");
    await expect(card).toContainText(cushion);
    await expect(card).toContainText(`추가 쿠션${suffix}`);
    await expect(card).toContainText(forbidden);
    await expect(card).toContainText("v1");

    await card.getByRole("button", { name: "수정", exact: true }).click();
    const editDialog = page.getByRole("dialog", { name: "말투 규칙 수정" });
    await editDialog.getByLabel(/권장 어조/).fill("핵심을 먼저 전하는 정중한 회신 어조");
    await editDialog.getByLabel("예문").fill("확인했습니다. 핵심 내용부터 회신드립니다.");
    await editDialog.getByRole("button", { name: "저장", exact: true }).click();
    await expect(card).toContainText("핵심을 먼저 전하는 정중한 회신 어조");
    await expect(card).toContainText("v2");

    await page.reload();
    await page.getByRole("searchbox", { name: "말투 규칙 검색" }).fill(situation);
    const persistedCard = page.getByTestId("tone-card").filter({ hasText: situation });
    await expect(persistedCard).toContainText("확인했습니다. 핵심 내용부터 회신드립니다.");

    await persistedCard.getByRole("button", { name: "기록", exact: true }).click();
    const historyDialog = page.getByRole("dialog", { name: `${situation} 말투 변경 기록` });
    await expect(historyDialog.getByText("말투 규칙 수정 · v2")).toBeVisible();
    await expect(historyDialog.getByText("변경 항목: 권장 어조 · 예문")).toBeVisible();
    await expect(historyDialog.getByText("상대를 배려하는 정중한 회신 어조").first()).toBeVisible();
    await expect(historyDialog.getByText("핵심을 먼저 전하는 정중한 회신 어조").first()).toBeVisible();
    await expect(historyDialog.getByText("새 규칙 등록 · v1")).toBeVisible();
    await historyDialog.getByRole("button", { name: "말투 변경 기록 닫기" }).click();

    await page.getByRole("button", { name: "+ 새 말투", exact: true }).click();
    const duplicateDialog = page.getByRole("dialog", { name: "새 말투 규칙" });
    await duplicateDialog.getByLabel(/상황/).fill(` ${situation} `);
    await duplicateDialog.getByLabel(/권장 어조/).fill("중복 말투");
    await duplicateDialog.getByRole("button", { name: "저장", exact: true }).click();
    await expect(duplicateDialog.getByText(/이미 등록되어 있습니다/)).toBeVisible();
    await duplicateDialog.getByRole("button", { name: "말투 규칙 창 닫기" }).click();

    await persistedCard.getByRole("button", { name: "사용 중지", exact: true }).click();
    await expect(persistedCard.getByText("사용 중지", { exact: true })).toBeVisible();
    await page.getByLabel("말투 규칙 사용 상태").selectOption("active");
    await expect(persistedCard).toHaveCount(0);
    await page.getByLabel("말투 규칙 사용 상태").selectOption("inactive");
    await expect(persistedCard).toHaveCount(1);

    page.once("dialog", (dialog) => dialog.accept());
    await persistedCard.getByRole("button", { name: "삭제", exact: true }).click();
    await expect(persistedCard).toHaveCount(0);
  } finally {
    await deleteUnusedBySituation(request, situation);
  }
});
