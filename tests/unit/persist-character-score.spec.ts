import { beforeEach, describe, expect, it, vi } from "vitest";

const upsert = vi.fn();
const deleteScore = vi.fn();
const getPlan = vi.fn();
const detail = vi.fn();

vi.mock("@/shared/api/character-score", () => ({
  characterScoreApi: {
    upsert: (...args: unknown[]) => upsert(...args),
    delete: (...args: unknown[]) => deleteScore(...args),
    list: vi.fn(),
  },
}));

vi.mock("@/shared/api/build-plan", () => ({
  buildPlanApi: {
    get: (...args: unknown[]) => getPlan(...args),
  },
}));

vi.mock("@/shared/api/inventory", () => ({
  inventoryApi: {
    detail: (...args: unknown[]) => detail(...args),
  },
}));

import {
  persistCharacterScoreSummary,
  recomputeAndPersistCharacterScore,
} from "@/shared/utils/relic-score/persist-character-score";

describe("persist character score generation guard", () => {
  beforeEach(() => {
    upsert.mockReset();
    deleteScore.mockReset();
    getPlan.mockReset();
    detail.mockReset();
    getPlan.mockResolvedValue(null);
    detail.mockResolvedValue({
      kind: "character",
      data: {
        equippedRelics: [
          {
            slot: "Head",
            mainStat: "HP",
            substats: [{ key: "CRIT Rate", value: 5, count: 1, step: 0 }],
          },
        ],
      },
    });
    upsert.mockResolvedValue(undefined);
    deleteScore.mockResolvedValue(undefined);
  });

  it("skips upsert when isCurrent becomes false after async work", async () => {
    let current = true;
    detail.mockImplementation(async () => {
      current = false;
      return {
        kind: "character",
        data: {
          equippedRelics: [
            {
              slot: "Head",
              mainStat: "HP",
              substats: [{ key: "CRIT Rate", value: 5, count: 1, step: 0 }],
            },
          ],
        },
      };
    });

    const result = await recomputeAndPersistCharacterScore(1001, {
      isCurrent: () => current,
    });

    expect(result).toBeNull();
    expect(upsert).not.toHaveBeenCalled();
    expect(deleteScore).not.toHaveBeenCalled();
  });

  it("persists when isCurrent stays true", async () => {
    const result = await recomputeAndPersistCharacterScore(1001, {
      isCurrent: () => true,
    });
    expect(result).not.toBeNull();
    expect(result!.characterId).toBe(1001);
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it("persistCharacterScoreSummary refuses stale writes", async () => {
    await persistCharacterScoreSummary(
      1001,
      {
        letterGrade: "A",
        potentialPct: 70,
        completionPct: 60,
        relicCount: 1,
        hasPlan: false,
      },
      { isCurrent: () => false },
    );
    expect(upsert).not.toHaveBeenCalled();
  });
});
