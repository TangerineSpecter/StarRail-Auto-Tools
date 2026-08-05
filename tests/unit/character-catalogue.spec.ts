import { describe, expect, it } from "vitest";
import {
  catalogueCharacterId,
  characterById,
  pathIconSrc,
  resolveCharacterCatalogue,
} from "@/shared/catalogue";
import { pathLabel } from "@/shared/catalogue/relic-options";

describe("resolveCharacterCatalogue", () => {
  it("distinguishes Trailblazer path variants by character id", () => {
    const destruction = resolveCharacterCatalogue({
      characterId: 8001,
      name: "开拓者",
      path: "Destruction",
    });
    const preservation = resolveCharacterCatalogue({
      characterId: 8003,
      name: "开拓者",
      path: "Preservation",
    });
    const remembrance = resolveCharacterCatalogue({
      characterId: 8007,
      name: "开拓者",
      path: "Remembrance",
    });
    const elation = resolveCharacterCatalogue({
      characterId: 8010,
      name: "开拓者",
      path: "Elation",
    });

    expect(destruction?.path).toBe("毁灭");
    expect(destruction?.element).toBe("物理");
    expect(destruction?.slug).toBe("playerboy");
    expect(preservation?.path).toBe("存护");
    expect(preservation?.element).toBe("火");
    expect(remembrance?.path).toBe("记忆");
    expect(elation?.path).toBe("欢愉");
    expect(elation?.slug).toBe("playergirl5");
  });

  it("falls back to name+path when character id is missing", () => {
    const huntMarch = resolveCharacterCatalogue({ name: "三月七", path: "Hunt" });
    const preservationMarch = resolveCharacterCatalogue({
      name: "三月七",
      path: "Preservation",
    });
    expect(huntMarch?.path).toBe("巡猎");
    expect(huntMarch?.element).toBe("虚数");
    expect(preservationMarch?.path).toBe("存护");
    expect(preservationMarch?.element).toBe("冰");
  });

  it("maps every catalogue entry through a unique game id", () => {
    expect(characterById.size).toBeGreaterThan(90);
    expect(catalogueCharacterId(characterById.get(8002)!)).toBe(8002);
    expect(characterById.get(1224)?.path).toBe("巡猎");
  });
});

describe("path icons and labels", () => {
  it("maps inventory path contracts including Elation", () => {
    expect(pathLabel("Elation")).toBe("欢愉");
    expect(pathIconSrc("Destruction")).toBe("/character-icons/paths/毁灭.webp");
    expect(pathIconSrc("Elation")).toBe("/character-icons/paths/欢愉.webp");
    expect(pathIconSrc("记忆")).toBe("/character-icons/paths/记忆.webp");
  });
});
