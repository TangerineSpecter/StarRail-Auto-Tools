use super::context::CharacterAdviceSnapshot;
use super::fetch::FetchedPage;
use super::profile::CharacterAdvisorProfile;
use super::sanitize::form_contract_text;
use super::search::SearchHit;
use crate::inventory::current_game_version;

pub fn system_prompt() -> String {
    "你是崩坏：星穹铁道的培养方案助手。根据当前版本客户端实装技能/行迹/套装效果、检索到的公开攻略和用户本地角色情况，生成一份能直接填进毕业目标表单的 JSON。\
开拓者、三月七、以及同名 SP/变体角色（如银狼 vs 银狼LV.999、丹恒 vs 丹恒•饮月/腾荒、砂金 vs 砂金•戏浪、知更鸟 vs 知更鸟•晴歌、刃 vs 千冶•刃）必须严格按当前角色与命途区分，绝不混用。\
当前版本角色技能/大行迹实装数值与套装实装效果为最高优先级事实；若不同攻略存在版本差异或角色改版，一律以当前版本机制和较新攻略为准，不要沿用旧版套装、旧倍率或记错套装效果。\
只有在存在主流备选套装、配速/流派分歧或需要玩家注意的配队条件时，才在 warnings 中给出 1～2 条简短提醒，不要写免责声明或技术抓取错误。只输出一个 JSON 对象，不要 Markdown。\n\n"
        .to_owned()
        + &form_contract_text()
}

pub fn user_prompt(
    snapshot: &CharacterAdviceSnapshot,
    profile: &CharacterAdvisorProfile,
    hits: &[SearchHit],
    pages: &[FetchedPage],
    search_warning: Option<&str>,
) -> Result<String, serde_json::Error> {
    let mut clean_snapshot = snapshot.clone();
    clean_snapshot.saved_plan = None;
    let snapshot_json = serde_json::to_string_pretty(&clean_snapshot)?;
    let version = current_game_version();

    let mut body = format!("请综合以下材料，生成崩坏：星穹铁道 v{version} 的配装建议 JSON。\n\n");
    body.push_str("## 角色机制与硬约束（v");
    body.push_str(version);
    body.push_str(" 客户端实装数据，最高优先级事实）\n");
    body.push_str(&format!(
        "- 角色：{}（命途：{} / 属性：{}）\n",
        snapshot.display_name,
        if !snapshot.path_zh.is_empty() {
            snapshot.path_zh.as_str()
        } else {
            profile.path_zh.as_str()
        },
        profile.element
    ));
    if let (Some(hp), Some(atk), Some(def), Some(speed)) = (
        profile.base_hp,
        profile.base_atk,
        profile.base_def,
        profile.base_speed,
    ) {
        body.push_str(&format!(
            "- 80 级基础面板：生命 {:.0} / 攻击 {:.0} / 防御 {:.0} / 速度 {:.0}\n",
            hp, atk, def, speed
        ));
    } else if let Some(speed) = profile.base_speed {
        body.push_str(&format!("- 80 级基础速度：{speed:.0}\n"));
    }
    if !profile.minor_trace_summary.is_empty() {
        body.push_str(&format!(
            "- 小行迹自带属性加成：{}\n",
            profile.minor_trace_summary.join("、")
        ));
    }
    body.push_str(&format!(
        "- 伤害/倍率特征：{}\n",
        profile.scaling_mode.label_zh()
    ));
    if !profile.disallowed_substats.is_empty() {
        body.push_str(&format!(
            "- 禁止写入权重与有效词条的无效属性：{}\n",
            profile.disallowed_substats.join(", ")
        ));
    }
    if profile.low_speed_preferred {
        body.push_str("- 速度偏好：该角色偏向低速机制，通常不堆速度（spdTarget 填 0）。\n");
    }
    for note in &profile.guidance_notes {
        body.push_str(&format!("- 机制说明：{note}\n"));
    }
    if !profile.skill_summary.is_empty() {
        body.push_str("- 当前版本核心大行迹与技能实装数值：\n");
        for line in &profile.skill_summary {
            body.push_str(&format!("  * {line}\n"));
        }
    }

    body.push_str("\n## 本地角色与装备（不含旧方案，避免锚定偏差）\n");
    body.push_str(&snapshot_json);

    body.push_str("\n\n## 检索结果（中英文攻略，优先采信最新与权威图文攻略）\n");
    if hits.is_empty() {
        body.push_str("（无检索结果）\n");
    } else {
        for (index, hit) in hits.iter().enumerate() {
            let date_tag = hit
                .published_at
                .as_deref()
                .map(|date| format!("[{date}] "))
                .unwrap_or_default();
            body.push_str(&format!(
                "{}. {date_tag}{} | {}\n   摘要：{}\n",
                index + 1,
                hit.title,
                hit.url,
                hit.snippet
            ));
        }
    }

    body.push_str("\n## 攻略核心正文摘录\n");
    if pages.is_empty() {
        body.push_str("（无额外正文摘录）\n");
    } else {
        for page in pages {
            body.push_str(&format!(
                "### {} ({})\n{}\n\n",
                page.title, page.url, page.text
            ));
        }
    }
    if let Some(warning) = search_warning {
        body.push_str("\n## 检索状态\n");
        body.push_str(warning);
        body.push('\n');
    }

    body.push_str(
        r#"
## 输出 JSON
{
  "summary": "一两句简明说明当前版本角色核心机制、为何选此套装与词条",
  "plan": {
    "cavernMode": "fourPiece 或 twoPlusTwo",
    "cavernSetA": 101,
    "cavernSetB": null,
    "planarSetId": 301,
    "mainStats": {
      "Body": ["CRIT Rate"],
      "Feet": ["SPD"],
      "PlanarSphere": ["Wind DMG Boost"],
      "LinkRope": ["ATK%"]
    },
    "targets": [{ "statKey": "SPD", "target": 134, "minimum": 120, "priority": 1 }],
    "effectiveSubstats": ["ATK%", "SPD", "Effect Hit Rate"],
    "substatWeights": { "ATK%": 1, "SPD": 1, "Effect Hit Rate": 1 },
    "minPotentialPct": 40,
    "spdTarget": 0,
    "note": "简短实操备注（如速度阈值、主词条取舍或配队提示，不超过100字）"
  },
  "sources": [{ "title": "", "url": "" }],
  "warnings": []
}
关键规则（必须严格遵守）：
1. 套装必须用系统提示清单里的 id，并核对其真实 2 件/4 件效果；英文攻略中的套装名请按效果准确对应到清单中的中文套装 id，优先采用当前版本实装且最契合机制的毕业套装，绝不沿用被新套装明显取代的旧套装（例如护盾辅助优先对比 128 自匿星芒的隐士 与 103 净庭教宗的圣骑士）。
2. 4 个主词条槽位（Body / Feet / PlanarSphere / LinkRope）每一项都必须至少填写 1 个可选主词条，严禁留空数组 []！充能绳请严格写 "Energy Regeneration Rate"，治疗衣请严格写 "Outgoing Healing Boost"，属性球请严格写 "<Element> DMG Boost"；若某部位攻略说「任意词条」，请填最通用的 2～3 个稳妥选项（如 ["HP%", "DEF%"]）。
3. 严格保持自洽：summary 和 note 中推荐的套装、主词条、速度门槛必须与 plan 字段完全一致（例如 note 写了优先治疗衣，Body 就必须包含 Outgoing Healing Boost）。
4. 权重只能是 0/0.25/0.5/0.75/1，非零最多 5 个；effectiveSubstats 必须等于 substatWeights 的非零键并按权重降序。
5. 评分器已按百分比权重的 40% 自动折算小生命/小攻击/小防御，因此 substatWeights 严禁出现裸 HP / ATK / DEF，请使用 HP% / ATK% / DEF%（若不需要生存副词条则不要硬塞）。
6. spdTarget 表示「最低达标速度门槛」（如 134/143/160），不是速度上限！低速角色、反击角色或穿「哀歌覆国的诗人」4 件套时，spdTarget 必须填 0，且不要给 SPD 设权重或穿速度鞋；反之若大行迹要求堆速度（如 125/150/160），必须按实装门槛设置速度鞋与 spdTarget。
7. 纯生命/纯防御倍率角色不得给 ATK / ATK% 设权重或主词条；持续伤害角色用攻击%、速度、效果命中，不给双暴/击破；超击破角色不给双暴。
8. sources 仅填写上方实际参考的 1～4 条真实攻略标题与 URL，不得编造链接；warnings 只写 0～2 条面向玩家的流派备选或关键注意点。
"#,
    );
    Ok(body)
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use super::*;
    use crate::advisor::context::SnapshotPlan;
    use crate::advisor::profile::resolve_profile;

    #[test]
    fn omits_saved_plan_and_injects_profile_constraints_and_dates() {
        let snapshot = CharacterAdviceSnapshot {
            character_id: 1407,
            name: "遐蝶".to_owned(),
            display_name: "遐蝶".to_owned(),
            path: "Remembrance".to_owned(),
            path_zh: "记忆".to_owned(),
            element: "量子".to_owned(),
            slug: "castorice".to_owned(),
            level: 80,
            eidolon: 0,
            light_cone: None,
            relics: vec![],
            saved_plan: Some(SnapshotPlan {
                cavern_mode: "fourPiece".to_owned(),
                cavern_sets: vec!["旧方案干扰套装".to_owned()],
                planar_set: String::new(),
                main_stats: HashMap::new(),
                effective_substats: vec!["ATK%".to_owned()],
                note: "不要抄这个旧方案".to_owned(),
            }),
            inventory_sets: vec![],
        };
        let profile = resolve_profile(1407, "遐蝶", "castorice", "量子");
        let hits = [SearchHit {
            title: "遐蝶最新毕业攻略".to_owned(),
            url: "https://example.com/castorice".to_owned(),
            snippet: "哀歌覆国的诗人4件套".to_owned(),
            content: None,
            published_at: Some("2026-05-20".to_owned()),
        }];

        let rendered = user_prompt(&snapshot, &profile, &hits, &[], None).expect("prompt");
        assert!(!rendered.contains("旧方案干扰套装"));
        assert!(!rendered.contains("不要抄这个旧方案"));
        assert!(rendered.contains("纯生命上限倍率"));
        assert!(rendered.contains("禁止写入权重与有效词条的无效属性：ATK, ATK%"));
        assert!(rendered.contains("[2026-05-20] 遐蝶最新毕业攻略"));
        assert!(rendered.contains("小行迹自带属性加成"));
    }
}
