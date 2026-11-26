import { describe, expect, it } from "vitest";
import {
  compareGameVersions,
  extractGameVersion,
  formatPlanUpdatedDate,
  formatPlanUpdatedDateTime,
  formatPlanVersionTag,
  isBuildPlanOutdated,
} from "@/shared/utils/build-plan-meta";

describe("build-plan-meta", () => {
  it("extracts game version from protocol version string", () => {
    expect(extractGameVersion("reliquary-v25.0.0 / HSR-4.7")).toBe("4.7");
    expect(extractGameVersion("HSR-4.10.1")).toBe("4.10.1");
    expect(extractGameVersion("")).toBe("");
    expect(extractGameVersion(null)).toBe("");
  });

  it("compares dotted game version numbers numerically", () => {
    expect(compareGameVersions("4.2", "4.7")).toBeLessThan(0);
    expect(compareGameVersions("4.7", "4.10")).toBeLessThan(0);
    expect(compareGameVersions("4.7", "v4.7")).toBe(0);
    expect(compareGameVersions("4.8", "4.7")).toBeGreaterThan(0);
  });

  it("only marks a plan outdated when both versions exist and plan is older", () => {
    expect(isBuildPlanOutdated("4.2", "4.7")).toBe(true);
    expect(isBuildPlanOutdated("4.7", "4.7")).toBe(false);
    expect(isBuildPlanOutdated("4.8", "4.7")).toBe(false);
    expect(isBuildPlanOutdated("", "4.7")).toBe(false);
    expect(isBuildPlanOutdated(null, "4.7")).toBe(false);
    expect(isBuildPlanOutdated("4.2", "")).toBe(false);
  });

  it("formats version tags and leaves blank values empty", () => {
    expect(formatPlanVersionTag("4.7")).toBe("v4.7");
    expect(formatPlanVersionTag("v4.7")).toBe("v4.7");
    expect(formatPlanVersionTag("  ")).toBe("");
    expect(formatPlanVersionTag(null)).toBe("");
  });

  it("formats epoch timestamps into local YYYY-MM-DD and YYYY-MM-DD HH:mm", () => {
    const sample = new Date(2026, 10, 26, 14, 5).getTime();
    expect(formatPlanUpdatedDate(sample)).toBe("2026-11-26");
    expect(formatPlanUpdatedDateTime(sample)).toBe("2026-11-26 14:05");
    expect(formatPlanUpdatedDate(0)).toBe("");
    expect(formatPlanUpdatedDate(null)).toBe("");
  });
});
