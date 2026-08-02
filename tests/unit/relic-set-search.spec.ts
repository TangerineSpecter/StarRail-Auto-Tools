import { describe, expect, it } from "vitest";
import { filterRelicSetOptions } from "@/features/build-planner/relic-set-search";

const options = [
  { setId: 101, name: "云无留迹的过客", kind: "cavern" as const },
  { setId: 102, name: "野穗伴行的快枪手", kind: "cavern" as const },
];

describe("filterRelicSetOptions", () => {
  it("matches partial names and every whitespace-separated search term", () => {
    expect(filterRelicSetOptions(options, "快枪")).toEqual([options[1]]);
    expect(filterRelicSetOptions(options, "野穗 快枪")).toEqual([options[1]]);
  });

  it("keeps all options when the search is blank", () => {
    expect(filterRelicSetOptions(options, "   ")).toEqual(options);
  });
});
