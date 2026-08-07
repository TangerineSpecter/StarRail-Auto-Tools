import { describe, expect, it } from "vitest";
import {
  catalogueCharacterId,
  characterById,
  characterDisplayName,
  equippedCharacterLabel,
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

describe("characterDisplayName", () => {
  it("appends path only for multi-path protagonists", () => {
    expect(characterDisplayName({ name: "卡芙卡", characterId: 1005 })).toBe("卡芙卡");
    expect(characterDisplayName({ name: "开拓者", characterId: 8006, path: "Harmony" })).toBe(
      "开拓者·同谐",
    );
    expect(characterDisplayName({ name: "三月七", path: "Hunt" })).toBe("三月七·巡猎");
    expect(characterDisplayName({ name: "三月七", characterId: 1001 })).toBe("三月七·存护");
    expect(characterDisplayName({ name: "开拓者" })).toBe("开拓者");
    expect(characterDisplayName({ name: "" })).toBe("");
  });
});

describe("equippedCharacterLabel", () => {
  it("appends path only for multi-path protagonists", () => {
    expect(equippedCharacterLabel("卡芙卡", 1005)).toBe("卡芙卡");
    expect(equippedCharacterLabel("开拓者", 8006)).toBe("开拓者·同谐");
    expect(equippedCharacterLabel("三月七", 1224)).toBe("三月七·巡猎");
    expect(equippedCharacterLabel("三月七", 1001)).toBe("三月七·存护");
    expect(equippedCharacterLabel("开拓者", null)).toBe("开拓者");
    expect(equippedCharacterLabel("", 8006)).toBe("");
  });
});
