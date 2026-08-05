# Stat Score 评分说明

本文说明 Fribbels [HSR Optimizer](https://github.com/fribbels/hsr-optimizer) 中的 **Stat Score（属性评分）** 与 **Estimated TBP（预计开拓力）** 口径。

原始文档：

- <https://github.com/fribbels/hsr-optimizer/blob/main/docs/guides/en/stat-score.md>
- 统计理论（IceDynamix）：<https://github.com/IceDynamix/est-tbp/blob/main/Estimated%20TBP.pdf>
- 理论中文说明：`docs/Estimated-TBP理论说明.md`
- 功能交付（去哪看 / 怎么用 / 怎么分析）：`docs/Stat-Score功能交付说明.md`

本文是项目侧的中文说明与使用边界，不替代上游实现细节；若与上游文档冲突，以上游为准。

## 1. 结论与边界

| 用途 | 该看什么 |
| ---- | -------- |
| 单件遗器词条是否「对角色有用」 | Stat Score / 潜力百分比 / 字母评级 |
| 整套遗器是否成型 | 六件潜力百分比平均值 + 主属性是否正确 |
| 还值不值得刷该部位 | Estimated TBP、Days、Perfection |
| 要不要用副词条重塑 | Reroll Potential |
| 最终伤害谁更强 | 优化器结果与 Combat Score，不要只比字母等级 |

设计定位：

- **Stat Score** 是「词条期望与稀有度」的启发式，用于横向比较不同部位、不同主属性的遗器。
- **Combat Score / 优化器** 才是实战输出的判定；副属性分 **不包含** 队友 buff、被动、战技条件等外部因素。
- 角色默认权重可改；不同玩家的速度断点、生存需求与玩法偏好不同，默认值只是起点。

## 2. 副属性权重（Substat Weight）

每个属性按对角色的价值，在 **0.0～1.0** 之间赋权，步进 **0.25**。

### 2.1 速度（SPD）

- 多数角色默认 **1.0**（最高权）。
- 原因：配速在队伍中很重要；优化器通常用「最低速度门槛」约束构建，而不是无限堆速度。
- 难点：达到目标断点之前，SPD 几乎都是满分；超过断点后接近 0。因此 SPD 权重应允许按目标断点自定义。

### 2.2 暴击 / 暴伤 / 攻击（典型暴击主 C）

默认大致为：

| 属性 | 权重 |
| ---- | ---- |
| ATK% | **0.75** |
| SPD | **1.0** |
| CR（暴击率） | **1.0** |
| CD（暴击伤害） | **1.0** |

- ATK 略低于 CR / CD：同等 roll 数下，暴击系通常对伤害提升更大。
- 角色有特殊缩放（HP、DEF、效果命中等）时，默认权重会调整。

### 2.3 生命 / 防御 / 效果抵抗

- 辅助的 HP / DEF：默认 **0.25**（除非技能吃这些面板）。
- 进攻型辅助 RES：默认 **0.25**。
- 生存位（盾 / 奶）RES：默认 **0.50**。

### 2.4 使用建议

- 默认权重适合「快速扫一眼词条质量」。
- 主 C 最终取舍应回到优化器与 Combat Score。
- 速度相关构建优先设断点与最低 SPD 过滤，不要只靠权重堆分。

## 3. 遗器评分计算

### 3.1 核心公式

```text
RelicPotentialPct = weightedPotential / idealPotential × 100
```

含义：当前遗器的加权潜力，相对 **同部位、同主属性语境** 下理论最优遗器的百分比。

- `idealPotential` 来自「该槽位 + 该主属性」下理论最佳副属性组合。
- 若某个有用副属性已被主属性占用（例如主属性已是暴击率，副属性不能再出 CR），则与 **剩余可出现的最优副属性** 比较。

### 3.2 单项加权潜力

```text
WeightedPotential = weight × value × potentialScale
```

`potentialScale` 将各属性统一到 **5 星高 roll 单位**。以暴击伤害高 roll `6.48` 为基准：

```text
potentialScale = 6.48 / grade5HighRollValue
```

| 属性类型 | 5 星高 roll | potentialScale |
| -------- | ----------- | -------------- |
| CD、击破特攻（BE） | 6.48 | **1.0** |
| DEF% | 5.4 | **1.2** |
| HP%、ATK%、效果命中（EHR）、RES | 4.32 | **1.5** |
| CR | 3.24 | **2.0** |
| SPD | 2.6 | **≈2.49** |

直观理解：CR / SPD 单次 roll 的显示数值更小，因此 scale 更大，才能与 CD 等「大数字」公平比较。

### 3.3 小攻击 / 小生命 / 小防御

- 权重 = 对应 **百分比属性权重的 40%**。
- `potentialScale` 仍使用小属性自身的高 roll。
- 这样小属性可以与 % 属性放在同一套分里比较，但天然偏弱。

### 3.4 字母评级

按当前潜力百分比，约 **5%** 一档：

| 潜力 % | 等级 |
| ------ | ---- |
| 0 / 5 | F / F+ |
| 10 / 15 | D / D+ |
| 20 / 25 | C / C+ |
| 30 / 35 | B / B+ |
| 40 / 45 | A / A+ |
| 50 / 55 | S / S+ |
| 60 / 65 | SS / SS+ |
| 70 / 75 | SSS / SSS+ |
| 80 / 85 | WTF / WTF+ |
| **90+** | **AEON** |

### 3.5 角色总分

- 角色 Stat Score = **六件已装备遗器潜力百分比的平均值**。
- 正确主属性在构建摘要中 **单独统计**。
- 可选主属性错误的遗器 **不给字母评级**。

### 3.6 与「最低加权 roll 筛选」的区别

优化器中的最低加权 roll 过滤是另一套口径，不是潜力百分比：

```text
WeightedMinRolls = weight × value / grade5LowRollValue
```

- 阈值 `1.0` 约等于「一个权重为 1 的期望属性」的一条 5 星低 roll。
- 该阈值用于 **筛选门槛**；Stat Score 用于 **相对理想件的完成度**。

## 4. Estimated TBP（预计开拓力）

Estimated TBP 回答的问题是：

> 在当前权重与主属性条件下，平均还要花多少开拓力 / 多少天，才刷到 **加权 roll 数更高** 的同条件遗器？

注意：

- 稀有度高 **不等于** 伤害一定更高。
- 该指标是 **刷本优先级启发式**。
- 真正谁更强仍看优化器与伤害相关评分。

### 4.1 Weighted Rolls（加权 roll 数）

```text
Weighted Rolls = Σ (每条 roll 的品质 × 该属性权重)
```

- 每条 roll 品质只有：**0.8 / 0.9 / 1.0**（低 / 中 / 高）。
- 小属性权重仍按对应 % 属性权重的 **40%**。

上游文档中 Topaz 火伤球示例（默认权重：ATK 相关 0.75、CD 1.0 等）：

```text
Weighted Rolls =
(0.9 + 0.8) × (0.75 × 0.40 小攻) +
(0.9 + 0.8 + 0.8) × (0.75 ATK%) +
(1.0 + 0.9) × (1.0 CD)
= 4.285
```

### 4.2 指标定义

| 指标 | 含义 |
| ---- | ---- |
| **Days / Estimated TBP** | 平均要刷多少开拓力 / 多少天，才能出 **加权 roll 数更高** 的同主属性、同套装部位遗器。上例约 **10,440 开拓力 ≈ 44 天**。 |
| **Perfection** | 离该角色理论满加权 roll 有多近。100% 通常要求：开局四词条全是期望属性，再五次强化全砸进权重 1 的属性，且全是高 roll。 |
| **Reroll Potential** | 若重塑副属性，完美度的 **期望变化**。例如绳的全部强化都砸在 CR，其余三条都无用时，重塑平均可能 **-25.7%** 完美度（大概率变差）。 |

### 4.3 统计假设

Estimated TBP 与 IceDynamix 合作；概率拆解、枚举方式与公式见 `docs/Estimated-TBP理论说明.md` 及上文 PDF。主要假设包括：

| 假设项 | 取值 |
| ------ | ---- |
| 每天开拓力 | 240 |
| 每轮掉落遗器数 | 约 2.1 |
| 四词条 / 三词条开局 | 20% / 80% |
| 隧洞遗器正确部位 | 25% |
| 位面饰品正确部位 | 50% |
| roll 品质 0.8 / 0.9 / 1.0 | 等概率 |
| 主属性 / 副属性出现率 | 按游戏数据（上游 `estTbp.ts`） |

## 5. 设计哲学（一句话）

> Stat Score 用权重、5 星高 roll 归一化和「相对理想件」百分比，把不同部位、不同主属性的遗器放在同一把尺子上比较；  
> Combat / 优化器再回答「这套构建在战斗里到底多强」。

SPD 按断点思维、ATK 略低于双暴、小属性打 4 折、百分比相对理想件归一化——都是为了避免简单把副属性数值加总导致的偏差。

## 6. 与本项目的关系

本仓库已接入纯前端评分内核与 UI（见 `src/shared/utils/relic-score/` 与 `docs/Stat-Score功能交付说明.md`）：

1. 上游评分口径的中文说明；
2. 遗器评级、刷本优先级、重塑建议的产品与算法参考；
3. 与 `背包数据字段标准`、`遗器图鉴维护` 等文档并列的业务知识文档。

实现核对点：

- 角色默认权重表可在培养方案中覆盖；
- 5 星高低 roll 数值、主副属性概率集中在 `relic-score/tables.ts`；
- 本项目展示字段是 camelCase 应用契约，不直接等于上游 UI 文案。

## 7. 参考链接

- [Stat Score 原文档](https://github.com/fribbels/hsr-optimizer/blob/main/docs/guides/en/stat-score.md)
- [Estimated TBP 理论 PDF](https://github.com/IceDynamix/est-tbp/blob/main/Estimated%20TBP.pdf)
- [主属性概率（上游代码）](https://github.com/fribbels/hsr-optimizer/blob/8185aaaeffe0c81355a19d0d26c858f5b251ec1a/src/lib/relics/estTbp/estTbp.ts#L85-L149)
- [副属性概率（上游代码）](https://github.com/fribbels/hsr-optimizer/blob/8185aaaeffe0c81355a19d0d26c858f5b251ec1a/src/lib/relics/estTbp/estTbp.ts#L172-L193)
