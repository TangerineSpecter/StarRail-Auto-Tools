import { defineComponent, h, ref, type Ref } from "vue";
import type { RelicListItem } from "@/types";
import { flushPromises, mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { dashboard, relics } from "@/shared/dev/mobile-fixtures";
import {
  createRelicQualityFilter,
  filterRelicQuality,
} from "@/features/inventory/relic-quality-filter";
import { useMobileRelicQuality } from "@/features/inventory/useMobileRelicQuality";
import RelicQualityToolbar from "@/features/inventory/RelicQualityToolbar.vue";

const getDashboard = vi.hoisted(() => vi.fn());
vi.mock("@/shared/api/build-plan", () => ({ buildPlanApi: { dashboard: getDashboard } }));

const high = { ...relics[0]!, itemId: 1 };
const low = {
  ...high,
  itemId: 2,
  substats: high.substats.map((stat) => ({ ...stat, count: 1, step: 0 })),
};

function mountQuality(items: Ref<RelicListItem[]> = ref([high, low]), error = vi.fn()) {
  let state!: ReturnType<typeof useMobileRelicQuality>;
  const wrapper = mount(
    defineComponent({
      setup() {
        state = useMobileRelicQuality(items, error);
        return () => h("div");
      },
    }),
  );
  return { wrapper, state, items, error };
}

describe("relic quality filtering", () => {
  it("retains quality previews in the drawer without applying sorting or loading plans again", async () => {
    getDashboard.mockClear();
    const wrapper = mount(RelicQualityToolbar, {
      props: { items: [high, low], actionsOnly: true, previewPlan: null },
    });
    expect(wrapper.find(".score-toolbar-fields").exists()).toBe(false);
    expect(wrapper.emitted("update:display-items")).toBeUndefined();
    expect(getDashboard).not.toHaveBeenCalled();
    await wrapper.get("button.score-action").trigger("click");
    expect(wrapper.emitted("notice")).toHaveLength(1);
    await wrapper.findAll("button.score-action")[1]!.trigger("click");
    await wrapper.get(".score-toolbar-confirm button").trigger("click");
    expect(wrapper.emitted("notice")).toHaveLength(2);
    expect(wrapper.emitted("update:display-items")).toBeUndefined();
    wrapper.unmount();
  });

  it("sorts both ways, preserves ties and leaves the source order untouched", () => {
    const same = { ...low, itemId: 3 };
    const input = [high, low, same];
    expect(filterRelicQuality(input, { sortMode: "score-asc", minGrade: "" }, null)).toEqual([
      low,
      same,
      high,
    ]);
    expect(filterRelicQuality(input, { sortMode: "score-desc", minGrade: "" }, null)).toEqual([
      high,
      low,
      same,
    ]);
    expect(filterRelicQuality(input, createRelicQualityFilter(), null)).toEqual(input);
    expect(input.map((item) => item.itemId)).toEqual([1, 2, 3]);
  });

  it("excludes ungraded pieces with an incorrect selectable main stat when a grade is required", () => {
    const wrongMain = relics[2]!;
    const plan = { ...dashboard[0]!.plan, mainStats: { Body: ["HP%"] } };
    expect(
      filterRelicQuality([high, wrongMain], { sortMode: "default", minGrade: "F" }, plan),
    ).toEqual([high]);
    expect(filterRelicQuality([], createRelicQualityFilter(), null)).toEqual([]);
  });
});

describe("mobile quality draft", () => {
  it("commits only on apply, follows loaded pages and resets through the same draft flow", async () => {
    getDashboard.mockResolvedValue(dashboard);
    const { state, wrapper, items } = mountQuality();
    await flushPromises();
    state.draft.value.sortMode = "score-asc";
    expect(state.displayItems.value).toEqual([high, low]);
    expect(state.activeCount.value).toBe(0);
    state.begin();
    expect(state.draft.value.sortMode).toBe("default");
    state.draft.value.sortMode = "score-asc";
    state.apply();
    expect(state.displayItems.value).toEqual([low, high]);
    expect(state.activeCount.value).toBe(1);
    items.value = [
      { ...high, itemId: 4 },
      { ...low, itemId: 5 },
    ];
    expect(state.displayItems.value.map((item) => item.itemId)).toEqual([5, 4]);
    state.resetDraft();
    expect(state.activeCount.value).toBe(1);
    state.apply();
    expect(state.displayItems.value.map((item) => item.itemId)).toEqual([4, 5]);
    expect(state.activeCount.value).toBe(0);
    wrapper.unmount();
  });

  it("ignores a plan response after unmount", async () => {
    let resolve!: (value: typeof dashboard) => void;
    getDashboard.mockReturnValue(
      new Promise<typeof dashboard>((done) => {
        resolve = done;
      }),
    );
    const { state, wrapper, error } = mountQuality(ref([]));
    wrapper.unmount();
    resolve(dashboard);
    await flushPromises();
    expect(state.plans.value).toEqual([]);
    expect(error).not.toHaveBeenCalled();
  });
});
