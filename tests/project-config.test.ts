import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("local development commands", () => {
  const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
    scripts: Record<string, string>;
    engines: { node: string };
  };

  it("binds both development and production servers to 127.0.0.1", () => {
    expect(packageJson.scripts.dev).toContain("--hostname 127.0.0.1");
    expect(packageJson.scripts.start).toContain("--hostname 127.0.0.1");
  });

  it("requires the Node.js version specified by the TRD", () => {
    expect(packageJson.engines.node).toBe(">=20.9.0");
  });
});
