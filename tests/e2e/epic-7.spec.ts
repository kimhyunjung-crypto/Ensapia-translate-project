import { expect, test, type APIRequestContext } from "@playwright/test";

async function deleteUnusedByJapanese(request: APIRequestContext, japaneseCanonical: string) {
  const response = await request.get("/api/people");
  if (!response.ok()) return;
  const body = await response.json();
  const person = body.people?.find(
    (item: { japaneseCanonical?: string }) => item.japaneseCanonical === japaneseCanonical,
  );
  if (person?.id && person.usedCount === 0) await request.delete(`/api/people/${person.id}`);
}

test("manages bidirectional person rules with tags, preview, persistence, and status", async ({
  page,
  request,
}, testInfo) => {
  const suffix = `${testInfo.workerIndex}${Date.now()}`;
  const japaneseCanonical = `鈴木${suffix}さん`;
  const updatedJapanese = `鈴木${suffix}部長`;
  const koreanCanonical = `스즈키${suffix}님`;
  const firstAlias = `스즈키${suffix} 담당자님`;
  const removedAlias = `스즈키${suffix}상`;
  const secondAlias = `스즈키${suffix} 매니저님`;

  await page.goto("/people");
  await expect(page.getByRole("heading", { name: "등록된 인명·호칭" })).toBeVisible();

  try {
    await page.getByRole("button", { name: "+ 새 멤버", exact: true }).click();
    const editor = page.getByRole("dialog", { name: "새 멤버 등록" });
    const aliasInput = editor.getByLabel("인식 표현 입력");
    await aliasInput.fill(firstAlias);
    await aliasInput.press("Enter");
    await aliasInput.fill(`${removedAlias},${secondAlias},`);
    await expect(editor.getByText(firstAlias, { exact: true })).toBeVisible();
    await expect(editor.getByText(removedAlias, { exact: true })).toBeVisible();
    await editor.getByRole("button", { name: `${removedAlias} 삭제` }).click();
    await expect(editor.getByText(removedAlias, { exact: true })).toHaveCount(0);

    await editor.getByLabel(/일본어 통합 표기/).fill(japaneseCanonical);
    await editor.getByLabel(/한국어 통합 표기/).fill(koreanCanonical);
    const preview = editor.getByRole("region", { name: "양방향 변환 미리보기" });
    await expect(preview).toContainText(`${firstAlias}→${japaneseCanonical}`);
    await expect(preview).toContainText(`${japaneseCanonical}→${koreanCanonical}`);
    await editor.getByRole("button", { name: "저장", exact: true }).click();

    const search = page.getByRole("searchbox", { name: "인명·호칭 검색" });
    await search.fill(firstAlias);
    const card = page.getByTestId("person-card").filter({ hasText: japaneseCanonical });
    await expect(card).toContainText(koreanCanonical);
    await expect(card).toContainText("2개");
    await expect(card).toContainText(secondAlias);

    await card.getByRole("button", { name: "수정" }).click();
    const editDialog = page.getByRole("dialog", { name: "인명·호칭 수정" });
    await editDialog.getByLabel(/일본어 통합 표기/).fill(updatedJapanese);
    await editDialog.getByLabel("인식 표현 입력").fill(`스즈키${suffix} 부장님`);
    await editDialog.getByLabel("인식 표현 입력").press("Enter");
    await editDialog.getByRole("button", { name: "저장", exact: true }).click();
    await expect(page.getByTestId("person-card").filter({ hasText: updatedJapanese })).toBeVisible();

    await page.reload();
    await page.getByRole("searchbox", { name: "인명·호칭 검색" }).fill(firstAlias);
    const persistedCard = page.getByTestId("person-card").filter({ hasText: updatedJapanese });
    await expect(persistedCard).toContainText(`스즈키${suffix} 부장님`);

    await page.getByRole("button", { name: "+ 새 멤버", exact: true }).click();
    const duplicateDialog = page.getByRole("dialog", { name: "새 멤버 등록" });
    await duplicateDialog.getByLabel("인식 표현 입력").fill(firstAlias);
    await duplicateDialog.getByLabel("인식 표현 입력").press("Enter");
    await duplicateDialog.getByLabel(/일본어 통합 표기/).fill("重複さん");
    await duplicateDialog.getByLabel(/한국어 통합 표기/).fill("중복님");
    await duplicateDialog.getByRole("button", { name: "저장", exact: true }).click();
    await expect(duplicateDialog.getByText(/다른 규칙에 이미 등록되어 있습니다/)).toBeVisible();
    await duplicateDialog.getByRole("button", { name: "인명·호칭 창 닫기" }).click();

    await persistedCard.getByRole("button", { name: "사용 중지" }).click();
    await expect(persistedCard.getByText("사용 중지", { exact: true })).toBeVisible();
    await page.getByLabel("인명 규칙 사용 상태").selectOption("active");
    await expect(persistedCard).toHaveCount(0);
    await page.getByLabel("인명 규칙 사용 상태").selectOption("inactive");
    await expect(persistedCard).toHaveCount(1);

    page.once("dialog", (dialog) => dialog.accept());
    await persistedCard.getByRole("button", { name: "삭제" }).click();
    await expect(persistedCard).toHaveCount(0);
  } finally {
    await deleteUnusedByJapanese(request, japaneseCanonical);
    await deleteUnusedByJapanese(request, updatedJapanese);
  }
});
