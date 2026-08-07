import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import TeamCard from "@/features/team/TeamCard.vue";
import type { Team } from "@/types";

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

const mountCard = () =>
  mount(TeamCard, {
    props: { team },
    global: {
      stubs: {
        Button: { template: "<button><slot /></button>" },
      },
    },
  });

describe("TeamCard", () => {
  it("renders team name, note, slots and orphan label", () => {
    const wrapper = mountCard();
    expect(wrapper.text()).toContain("末日一队");
    expect(wrapper.text()).toContain("破盾优先");
    expect(wrapper.text()).toContain("3/4");
    expect(wrapper.text()).toContain("三月七·存护");
    expect(wrapper.text()).toContain("三月七·巡猎");
    expect(wrapper.text()).toContain("开拓者·同谐");
    expect(wrapper.text()).toContain("空位");
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
