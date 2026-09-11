import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, KeepAlive, ref } from "vue";
import TeamActionAxisDrawer from "@/features/team/TeamActionAxisDrawer.vue";
import type { Team } from "@/types";

const { cancel, load } = vi.hoisted(() => ({
  cancel: vi.fn(),
  load: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/features/team/useTeamActionAxis", () => ({
  useTeamActionAxis: () => ({
    profiles: { value: [] },
    loading: { value: false },
    error: { value: "" },
    load,
    cancel,
  }),
}));

const team: Team = {
  teamId: 1,
  name: "测试队伍",
  note: "",
  members: [null, null, null, null],
  createdAt: 1,
  updatedAt: 1,
};

describe("TeamActionAxisDrawer", () => {
  beforeEach(() => {
    load.mockClear();
    cancel.mockClear();
  });

  it("detaches Escape handling while cached and reloads after activation", async () => {
    const visible = ref(true);
    const close = vi.fn();
    const wrapper = mount(
      defineComponent({
        setup() {
          return () =>
            h(KeepAlive, null, () =>
              visible.value ? h(TeamActionAxisDrawer, { team, revision: 1, onClose: close }) : null,
            );
        },
      }),
    );

    expect(load).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(close).toHaveBeenCalledTimes(1);

    visible.value = false;
    await wrapper.vm.$nextTick();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(close).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledTimes(1);

    visible.value = true;
    await wrapper.vm.$nextTick();
    expect(load).toHaveBeenCalledTimes(2);

    wrapper.unmount();
  });
});
