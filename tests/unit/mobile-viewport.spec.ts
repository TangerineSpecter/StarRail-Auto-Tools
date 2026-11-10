import { describe, expect, it } from "vitest";
import { mobileEntryHtml } from "@/shared/utils/mobile-viewport";

describe("mobile entry viewport", () => {
  it("locks page scale and switches only the mobile entry", () => {
    const desktop =
      '<meta name="viewport" content="width=device-width, initial-scale=1.0"><script src="/src/main.ts"></script>';
    const html = mobileEntryHtml(desktop);
    expect(html.match(/name="viewport"/g)).toHaveLength(1);
    expect(html).toContain("minimum-scale=1.0, maximum-scale=1.0, user-scalable=no");
    expect(html).toContain("viewport-fit=cover");
    expect(html).toContain("/src/mobile/main.ts");
    expect(desktop).not.toContain("user-scalable");
  });
});
