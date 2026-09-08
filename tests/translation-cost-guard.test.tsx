import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TranslationWorkspace } from "@/components/translation-workspace";

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function enterKoreanSource() {
  fireEvent.change(screen.getByLabelText("원문"), {
    target: { value: "확인 부탁드립니다." },
  });
}

describe("EPIC 9 translation cost guard UI", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("shows the 80 percent warning before continuing the translation", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({
        ok: true,
        guard: { state: "warning", spentUsd: 8, limitUsd: 10, warningAtUsd: 8 },
      }))
      .mockResolvedValueOnce(response({
        ok: true,
        translation: {
          direction: "ko-ja",
          targetLanguage: "ja",
          finalText: "ご確認をお願いいたします。",
          demo: true,
        },
      }));
    vi.stubGlobal("fetch", fetchMock);
    render(<TranslationWorkspace />);
    enterKoreanSource();
    fireEvent.click(screen.getByRole("button", { name: /번역하기/ }));

    expect(await screen.findByText(/\$8\.0000 경고 기준에 도달했습니다/)).toBeVisible();
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/operations/cost-guard",
      { cache: "no-store" },
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("asks at the monthly limit and keeps the source when the user cancels", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(response({
      ok: true,
      guard: { state: "confirmation_required", spentUsd: 10, limitUsd: 10, warningAtUsd: 8 },
    }));
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    vi.stubGlobal("fetch", fetchMock);
    render(<TranslationWorkspace />);
    enterKoreanSource();
    fireEvent.click(screen.getByRole("button", { name: /번역하기/ }));

    await waitFor(() => expect(confirm).toHaveBeenCalledOnce());
    expect(await screen.findByText(/비용 한도 확인에서 번역을 취소했습니다/)).toBeVisible();
    expect(screen.getByLabelText("원문")).toHaveValue("확인 부탁드립니다.");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
