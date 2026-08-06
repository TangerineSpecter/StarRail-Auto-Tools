import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { nextTick, ref } from "vue";
import SubstatWeightEditor from "@/features/build-planner/SubstatWeightEditor.vue";
import { roleWeights } from "@/shared/utils/relic-score";

describe("SubstatWeightEditor", () => {
  it("keeps displayed template weights when editing one value from empty stored map", async () => {
    const weights = ref<Record<string, number>>({});
    const minPotentialPct = ref(40);
    const spdTarget = ref(0);
    const wrapper = mount(SubstatWeightEditor, {
      props: {
        modelValue: weights.value,
        "onUpdate:modelValue": (value: Record<string, number>) => {
          weights.value = value;
          void wrapper.setProps({ modelValue: value });
        },
        minPotentialPct: minPotentialPct.value,
        "onUpdate:minPotentialPct": (value: number) => {
          minPotentialPct.value = value;
        },
        spdTarget: spdTarget.value,
        "onUpdate:spdTarget": (value: number) => {
          spdTarget.value = value;
        },
        effectiveSubstats: ["SPD", "CRIT Rate", "CRIT DMG", "ATK%"],
      },
      global: {
        stubs: {
          Select: true,
          InputNumber: {
            props: ["modelValue"],
            emits: ["update:modelValue"],
            template:
              '<button class="stub-input" @click="$emit(\'update:modelValue\', 0.5)">set</button>',
          },
        },
      },
    });

    await nextTick();
    // Toolbar also uses InputNumber; target the weight grid (HP is first SUBSTAT_KEY).
    await wrapper.get(".weight-grid .stub-input").trigger("click");
    await nextTick();

    expect(Object.keys(weights.value).length).toBeGreaterThan(4);
    // Inferred critDps has SPD=1; must not be wiped to 0 when another key is edited.
    expect(weights.value.SPD).toBe(1);
    expect(weights.value["CRIT Rate"]).toBe(1);
    expect(weights.value.HP).toBe(0.5);
    wrapper.unmount();
  });

  it("ignores null InputNumber emissions so rebinds do not zero every stat", async () => {
    const base = roleWeights("critDps");
    const weights = ref({ ...base });
    const minPotentialPct = ref(40);
    const spdTarget = ref(0);
    const wrapper = mount(SubstatWeightEditor, {
      props: {
        modelValue: weights.value,
        "onUpdate:modelValue": (value: Record<string, number>) => {
          weights.value = value;
          void wrapper.setProps({ modelValue: value });
        },
        minPotentialPct: minPotentialPct.value,
        "onUpdate:minPotentialPct": (value: number) => {
          minPotentialPct.value = value;
        },
        spdTarget: spdTarget.value,
        "onUpdate:spdTarget": (value: number) => {
          spdTarget.value = value;
        },
        effectiveSubstats: [],
      },
      global: {
        stubs: {
          Select: true,
          InputNumber: {
            props: ["modelValue"],
            emits: ["update:modelValue"],
            template:
              '<button class="stub-input" @click="$emit(\'update:modelValue\', null)">null</button>',
          },
        },
      },
    });

    await nextTick();
    for (const btn of wrapper.findAll(".stub-input")) {
      await btn.trigger("click");
    }
    await nextTick();

    expect(weights.value.SPD).toBe(1);
    expect(weights.value["CRIT Rate"]).toBe(1);
    expect(weights.value["CRIT DMG"]).toBe(1);
    expect(weights.value["ATK%"]).toBe(0.75);
    wrapper.unmount();
  });

  it("materializes current display weights when clearing the role to custom", async () => {
    const weights = ref<Record<string, number>>({});
    const minPotentialPct = ref(40);
    const spdTarget = ref(0);
    const wrapper = mount(SubstatWeightEditor, {
      props: {
        modelValue: weights.value,
        "onUpdate:modelValue": (value: Record<string, number>) => {
          weights.value = value;
          void wrapper.setProps({ modelValue: value });
        },
        minPotentialPct: minPotentialPct.value,
        "onUpdate:minPotentialPct": (value: number) => {
          minPotentialPct.value = value;
        },
        spdTarget: spdTarget.value,
        "onUpdate:spdTarget": (value: number) => {
          spdTarget.value = value;
        },
        effectiveSubstats: ["Break Effect", "SPD", "ATK%"],
      },
      global: {
        stubs: {
          // Expose a clear control that drives v-model to null (自定义).
          Select: {
            props: ["modelValue"],
            emits: ["update:modelValue"],
            template:
              '<button class="stub-clear" @click="$emit(\'update:modelValue\', null)">clear</button>',
          },
          InputNumber: true,
        },
      },
    });

    await nextTick();
    await wrapper.get(".stub-clear").trigger("click");
    await nextTick();

    expect(weights.value.SPD).toBe(1);
    expect(weights.value["Break Effect"]).toBe(1);
    expect(weights.value["ATK%"]).toBe(0.75);
    wrapper.unmount();
  });
});
