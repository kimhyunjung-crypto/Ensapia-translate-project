import { expect, test } from "@playwright/test";
import { config as loadEnvironmentFile } from "dotenv";
import { decodeEncryptionKey, encryptText } from "@/lib/crypto";
import { createPrismaClient } from "@/lib/database";
import { ENCRYPTION_CONTEXT } from "@/lib/encryption-contexts";
import { updateCostPolicy, updateModelConfigurations } from "@/modules/operations/service";

loadEnvironmentFile({ path: ".env.local", quiet: true });

test("operates AI models, costs, policy, and confirmed translation deletion", async ({ page }, testInfo) => {
  const client = createPrismaClient("file:./dev.db");
  const key = decodeEncryptionKey();
  const suffix = `${testInfo.workerIndex}${Date.now()}`;
  const jobId = `epic9-browser-job-${suffix}`;
  const usageId = `epic9-browser-usage-${suffix}`;
  const originalModel = "gpt-5.6-luna";
  const temporaryModel = `gpt-5.6-luna-ui-${suffix}`;

  await client.translationJob.create({
    data: {
      id: jobId,
      sourceLanguage: "ko",
      targetLanguage: "ja",
      sourceTextEnc: encryptText("기간 삭제용 가상 메시지", key, ENCRYPTION_CONTEXT.translationSource),
      finalTextEnc: encryptText("期間削除用の仮想メッセージ", key, ENCRYPTION_CONTEXT.translationFinal),
      status: "completed",
      startedAt: new Date("2040-12-24T03:00:00.000Z"),
      completedAt: new Date("2040-12-24T03:00:01.000Z"),
      apiUsage: {
        create: {
          id: usageId,
          provider: "openai",
          modelId: originalModel,
          stage: "final",
          inputTokens: 12,
          outputTokens: 8,
          estimatedCostUsd: 0.000012,
          occurredAt: new Date("2040-12-24T03:00:01.000Z"),
        },
      },
    },
  });

  try {
    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "AI와 데이터 운영" })).toBeVisible();

    const connections = page.getByLabel("AI 연결 상태");
    await expect(connections.getByText("OpenAI", { exact: true })).toBeVisible();
    await expect(connections.getByText("Gemini", { exact: true })).toBeVisible();
    await expect(connections.getByText("연결됨", { exact: true })).toHaveCount(2);
    await expect(page.getByText("DEMO · 가짜 데이터", { exact: true })).toBeVisible();

    await expect(page.getByRole("heading", { name: "사용량과 예상 비용" })).toBeVisible();
    await expect(page.getByText("최근 번역 한 건", { exact: true })).toBeVisible();
    await expect(page.getByText("5단계", { exact: false })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "적용일별 모델 단가" })).toBeVisible();
    await expect(page.getByText("gemini-3.7-flash", { exact: true })).toHaveCount(2);

    const modelInput = page.getByLabel("OpenAI 1차 번역 모델 ID");
    await expect(modelInput).toHaveValue(originalModel);
    await modelInput.fill(temporaryModel);
    await page.getByRole("button", { name: "모델 설정 저장", exact: true }).click();
    await expect(page.getByText("변경한 모델 설정을 새 버전으로 저장했습니다.")).toBeVisible();
    await expect(modelInput).toHaveValue(temporaryModel);

    const limitInput = page.getByLabel("월 한도 (USD)");
    await expect(limitInput).toHaveValue("10");
    await limitInput.fill("12.5");
    await page.getByRole("button", { name: "한도 저장", exact: true }).click();
    await expect(page.getByText("월 예상 비용 한도를 저장했습니다.")).toBeVisible();
    await expect(limitInput).toHaveValue("12.5");

    await expect(page.getByRole("heading", { name: "저장·외부 전송 정책" })).toBeVisible();
    await expect(page.getByText("현재 번역의 원문과 적용 규칙만 OpenAI·Gemini에 전송")).toBeVisible();
    await expect(page.getByText("자동 삭제 없음", { exact: false })).toBeVisible();

    await page.getByLabel("시작일").fill("2040-12-24");
    await page.getByLabel("종료일").fill("2040-12-24");
    await page.getByRole("button", { name: "삭제 대상 확인", exact: true }).click();
    await expect(page.getByText("1건의 번역 내용이 삭제 대상입니다.")).toBeVisible();
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "영구 삭제", exact: true }).click();
    await expect(page.getByText("번역 1건의 내용을 영구 삭제했습니다. 사용량 통계는 유지됩니다.")).toBeVisible();

    expect(await client.translationJob.findUnique({ where: { id: jobId } })).toBeNull();
    expect(await client.apiUsage.findUnique({ where: { id: usageId } })).toMatchObject({ jobId: null });
  } finally {
    await updateModelConfigurations(
      client,
      [{ provider: "openai", stage: "draft", modelId: originalModel }],
    );
    await updateCostPolicy(client, 10);
    await client.apiUsage.deleteMany({ where: { id: usageId } });
    await client.translationJob.deleteMany({ where: { id: jobId } });
    await client.$disconnect();
  }
});
