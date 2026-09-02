import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { isAllowedLocalHost, proxy } from "@/proxy";

describe("local-only request protection", () => {
  it("accepts only the exact 127.0.0.1 host with an optional numeric port", () => {
    expect(isAllowedLocalHost("127.0.0.1")).toBe(true);
    expect(isAllowedLocalHost("127.0.0.1:3000")).toBe(true);
    expect(isAllowedLocalHost("localhost:3000")).toBe(false);
    expect(isAllowedLocalHost("192.168.0.12:3000")).toBe(false);
    expect(isAllowedLocalHost("127.0.0.1.example.com")).toBe(false);
    expect(isAllowedLocalHost(null)).toBe(false);
  });

  it("returns a safe 403 message for a non-local host", () => {
    const request = new NextRequest("http://localhost:3000/translate", {
      headers: { host: "localhost:3000" },
    });
    const response = proxy(request);

    expect(response.status).toBe(403);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("allows requests addressed to 127.0.0.1", () => {
    const request = new NextRequest("http://127.0.0.1:3000/translate", {
      headers: { host: "127.0.0.1:3000" },
    });

    expect(proxy(request).status).toBe(200);
  });
});
