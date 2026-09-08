import { expect, test, type APIRequestContext } from "@playwright/test";

async function deleteUnusedBySource(request: APIRequestContext, sourceText: string) {
  const response = await request.get("/api/glossary");
  if (!response.ok()) return;
  const body = await response.json();
  const term = body.terms?.find((item: { sourceText?: string }) => item.sourceText === sourceText);
  if (term?.id && term.usedCount === 0) await request.delete(`/api/glossary/${term.id}`);
}

test("manages glossary terms, instant filters, persistence, status, and history", async ({
  page,
  request,
}, testInfo) => {
  const sourceText = `Epic6Browser${testInfo.workerIndex}${Date.now()}`;
  await page.goto("/glossary");
  await expect(page.getByRole("heading", { name: "등록 용어" })).toBeVisible();

  try {
    await page.getByRole("button", { name: "+ 새 용어" }).click();
    const editor = page.getByRole("dialog", { name: "새 용어 등록" });
    await editor.getByLabel(/원어/).fill(sourceText);
    await editor.getByLabel(/권장 표기/).fill("EPIC6ブラウザー");
    await editor.getByLabel("설명").fill("브라우저 저장 점검");
    await editor.getByLabel("사용하지 않을 표기").fill("에픽6, エピック6");
    await editor.getByRole("button", { name: "저장", exact: true }).click();

    const search = page.getByRole("searchbox", { name: "용어 검색" });
    await search.fill(sourceText);
    const row = page.getByTestId("glossary-row").filter({ hasText: sourceText });
    await expect(row).toContainText("EPIC6ブラウザー");
    await expect(row).toContainText("브라우저 저장 점검");

    await page.getByLabel("언어 방향").selectOption("ja-ko");
    await expect(row).toHaveCount(0);
    await page.getByLabel("언어 방향").selectOption("ko-ja");
    await expect(row).toHaveCount(1);

    await row.getByRole("button", { name: "수정" }).click();
    const editDialog = page.getByRole("dialog", { name: "용어 수정" });
    await editDialog.getByLabel(/권장 표기/).fill("EPIC6推奨ブラウザー");
    await editDialog.getByLabel("설명").fill("새로고침 유지 점검");
    await editDialog.getByRole("button", { name: "저장", exact: true }).click();
    await expect(row).toContainText("EPIC6推奨ブラウザー");

    await page.reload();
    await page.getByRole("searchbox", { name: "용어 검색" }).fill(sourceText);
    const persistedRow = page.getByTestId("glossary-row").filter({ hasText: sourceText });
    await expect(persistedRow).toContainText("새로고침 유지 점검");

    await persistedRow.getByRole("button", { name: "기록" }).click();
    const historyDialog = page.getByRole("dialog", { name: `${sourceText} 변경 기록` });
    await expect(historyDialog.getByText("용어 수정")).toBeVisible();
    await expect(historyDialog.getByText("권장 표기 · 설명")).toBeVisible();
    await expect(historyDialog.getByText("새 용어 등록")).toBeVisible();
    await historyDialog.getByRole("button", { name: "변경 기록 닫기" }).click();

    await persistedRow.getByRole("button", { name: "사용 중지" }).click();
    await expect(persistedRow.getByText("사용 중지", { exact: true })).toBeVisible();
    await page.getByLabel("사용 상태").selectOption("active");
    await expect(persistedRow).toHaveCount(0);
    await page.getByLabel("사용 상태").selectOption("inactive");
    await expect(persistedRow).toHaveCount(1);

    page.once("dialog", (dialog) => dialog.accept());
    await persistedRow.getByRole("button", { name: "삭제" }).click();
    await expect(persistedRow).toHaveCount(0);
  } finally {
    await deleteUnusedBySource(request, sourceText);
  }
});

test("imports valid CSV rows and reports each rejected row", async ({ page, request }, testInfo) => {
  const sourceText = `Epic6Import${testInfo.workerIndex}${Date.now()}`;
  await page.goto("/glossary");

  try {
    await page.locator('input[type="file"]').setInputFiles({
      name: "epic-6-glossary.csv",
      mimeType: "text/csv",
      buffer: Buffer.from([
        "sourceText,targetText,direction,description,forbiddenTerms,isActive",
        `${sourceText},一括登録,ko-ja,정상 행,잘못된표기,true`,
        ",필수값 없음,ko-ja,,,true",
        "Ontos,중복 표기,ko-ja,,,true",
      ].join("\n")),
    });

    const report = page.getByRole("region", { name: "파일 가져오기 결과" });
    await expect(report.getByText("1개 용어를 추가했습니다.")).toBeVisible();
    await expect(report.getByText("2개 행은 추가하지 못했습니다.")).toBeVisible();
    await expect(report.getByText(/3행.*원어: 내용을 입력해 주세요/)).toBeVisible();
    await expect(report.getByText(/4행.*이미 등록된 원어/)).toBeVisible();

    await page.getByRole("searchbox", { name: "용어 검색" }).fill(sourceText);
    await expect(page.getByTestId("glossary-row").filter({ hasText: sourceText })).toContainText("一括登録");
  } finally {
    await deleteUnusedBySource(request, sourceText);
  }
});
