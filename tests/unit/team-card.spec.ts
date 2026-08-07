import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import TeamCard from "@/features/team/TeamCard.vue";
import type { CharacterBuildScore, Team } from "@/types";

const team: Team = {
  teamId: 7,
  name: "末日一队",
  note: "破盾优先",
  members: [
    { characterId: 1001, name: "三月七", path: "Preservation", level: 80, owned: true },
    { characterId: 1224, name: "三月七", path: "Hunt", level: 70, owned: true },
    { characterId: 8006, name: "开拓者", path: "Harmony", level: 80, owned: true },
    null,
  ],
  createdAt: 1,
  updatedAt: 2,
};

const scores = new Map<number, CharacterBuildScore>([
  [
    1001,
    {
      characterId: 1001,
      letterGrade: "A-",
      potentialPct: 71.4,
      completionPct: 65.2,
      relicCount: 6,
      hasPlan: true,
      computedAt: 1,
    },
  ],
]);

const mountCard = (memberScores?: Map<number, CharacterBuildScore>, scoresReady = true) =>
  mount(TeamCard, {
    props: { team, memberScores, scoresReady },
    global: {
      stubs: {
        Button: { template: "<button><slot /></button>" },
      },
    },
  });

describe("TeamCard", () => {
  it("renders team name, note, slots and multipath labels", () => {
    const wrapper = mountCard();
    expect(wrapper.text()).toContain("末日一队");
    expect(wrapper.text()).toContain("破盾优先");
    expect(wrapper.text()).toContain("3/4");
    expect(wrapper.text()).toContain("三月七·存护");
    expect(wrapper.text()).toContain("三月七·巡猎");
    expect(wrapper.text()).toContain("开拓者·同谐");
    expect(wrapper.text()).toContain("空位");
    expect(wrapper.text()).toContain("未装备遗器");
  });

  it("renders grade, potential and completion when scores are provided", () => {
    const wrapper = mountCard(scores);
    expect(wrapper.text()).toContain("评级");
    expect(wrapper.text()).toContain("A-");
    expect(wrapper.text()).toContain("潜力");
    expect(wrapper.text()).toContain("71%");
    expect(wrapper.text()).toContain("完成");
    expect(wrapper.text()).toContain("65%");
  });

  it("emits edit and delete", async () => {
    const wrapper = mountCard();
    const buttons = wrapper.findAll("button");
    await buttons[0].trigger("click");
    await buttons[1].trigger("click");
    expect(wrapper.emitted("edit")).toHaveLength(1);
    expect(wrapper.emitted("delete")).toHaveLength(1);
  });
});
