import { describe, expect, it } from "vitest";
import { qualityMainStatTip, qualityPassCountTip } from "@/features/build-planner/quality-tips";

describe("quality dashboard tips", () => {
  it("explains main-stat matching against the plan targets", () => {
    const tip = qualityMainStatTip();
    expect(tip).toContain("各部位允许主词条");
    expect(tip).toContain("命中该部位目标即算正确");
    expect(tip).toContain("未勾选目标时不扣分");
    expect(tip).toContain("已装备件数");
  });

  it("explains quality-pass using the plan potential threshold", () => {
    const tip = qualityPassCountTip(45);
    expect(tip).toContain("质量门槛");
    expect(tip).toContain("45%");
    expect(tip).toContain("主属性未判错");
    expect(tip).toContain("词条潜力达到门槛");
    expect(tip).toContain("没有字母评级");
  });
});
