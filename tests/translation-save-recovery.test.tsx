import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TranslationWorkspace } from "@/components/translation-workspace";

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("EPIC 10 storage-only recovery UI", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("retries persistence without issuing a second translation request", async () => {
    const recoveryId = "aa58b192-1ed8-4384-b14d-9de638d86f2a";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({
        ok: true,
        guard: { state: "normal", spentUsd: 1, limitUsd: 10, warningAtUsd: 8 },
      }))
      .mockResolvedValueOnce(response({
        ok: false,
        error: {
          code: "TRANSLATION_SAVE_FAILED",
          message: "번역은 완료했지만 기록을 저장하지 못했습니다.",
        },
        recoveryId,
      }, 503))
      .mockResolvedValueOnce(response({
        ok: true,
        translation: {
          direction: "ko-ja",
          targetLanguage: "ja",
          finalText: "保存を再試行しました。",
          demo: true,
        },
      }));
    vi.stubGlobal("fetch", fetchMock);
    render(<TranslationWorkspace />);

    fireEvent.change(screen.getByLabelText("원문"), {
      target: { value: "저장 실패를 다시 처리해 주세요." },
    });
    fireEvent.click(screen.getByRole("button", { name: "번역하기" }));

    expect(await screen.findByRole("heading", {
      name: "번역은 완료했지만 저장하지 못했습니다",
    })).toBeVisible();
    expect(screen.getByLabelText("원문")).toHaveValue("저장 실패를 다시 처리해 주세요.");
    fireEvent.click(screen.getByRole("button", { name: "저장 다시 시도" }));

    expect(await screen.findByTestId("final-translation")).toHaveTextContent(
      "保存を再試行しました。",
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls.filter(([url]) => url === "/api/translate")).toHaveLength(1);
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/translate/recover",
      expect.objectContaining({ body: JSON.stringify({ recoveryId }) }),
    );
  });
});
