import { describe, expect, it } from "vitest";
import { formatStatValue, pathLabel } from "@/shared/catalogue/relic-options";

describe("relic display options", () => {
  it("formats stored percentage points without scaling them again", () => {
    expect(formatStatValue("CRIT Rate", 32.4)).toBe("32.4%");
    expect(formatStatValue("Physical DMG Boost", 38.88)).toBe("38.9%");
    expect(formatStatValue("SPD", 25.032)).toBe("25.0");
  });

  it("maps inventory path contract values to Chinese labels", () => {
    expect(pathLabel("Hunt")).toBe("巡猎");
    expect(pathLabel("Destruction")).toBe("毁灭");
    expect(pathLabel("Remembrance")).toBe("记忆");
  });
});
