import { describe, expect, it } from "vitest";
import { formatStatValue, pathLabel, statLabel } from "@/shared/catalogue/relic-options";

describe("relic display options", () => {
  it("formats stored percentage points without scaling them again", () => {
    expect(formatStatValue("CRIT Rate", 32.4)).toBe("32.4%");
    expect(formatStatValue("Physical DMG Boost", 38.88)).toBe("38.9%");
    expect(formatStatValue("SPD", 25.032)).toBe("25.0");
  });

  it("maps inventory substat keys including Effect RES to Chinese labels", () => {
    expect(statLabel("Effect RES")).toBe("效果抵抗");
    expect(statLabel("Effect Hit Rate")).toBe("效果命中");
    expect(statLabel("Break Effect")).toBe("击破特攻");
  });

  it("maps inventory path contract values to Chinese labels", () => {
    expect(pathLabel("Hunt")).toBe("巡猎");
    expect(pathLabel("Destruction")).toBe("毁灭");
    expect(pathLabel("Remembrance")).toBe("记忆");
    expect(pathLabel("Elation")).toBe("欢愉");
  });
});
