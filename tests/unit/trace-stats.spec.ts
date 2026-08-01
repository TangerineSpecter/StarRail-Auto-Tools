import { describe, expect, it } from "vitest";
import { primaryTraceNodes } from "@/features/inventory/trace-stats";

describe("primaryTraceNodes", () => {
  it("drops the mirrored trace tree returned by some character pages", () => {
    expect(
      primaryTraceNodes([
        { id: 1310201, name: "击破强化" },
        { id: 1310202, name: "效果抵抗强化" },
        { id: 11310201, name: "击破强化" },
        { id: 11310202, name: "效果抵抗强化" },
      ]),
    ).toEqual([
      { id: 1310201, name: "击破强化" },
      { id: 1310202, name: "效果抵抗强化" },
    ]);
  });
});
