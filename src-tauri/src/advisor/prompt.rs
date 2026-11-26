use super::context::CharacterAdviceSnapshot;
use super::fetch::FetchedPage;
use super::profile::CharacterAdvisorProfile;
use super::sanitize::form_contract_text;
use super::search::SearchHit;
use crate::inventory::current_game_version;

pub fn system_prompt() -> String {
    "你是崩坏：星穹铁道的培养方案助手。根据当前版本角色机制、检索到的公开攻略和用户本地角色情况，生成一份能直接填进毕业目标表单的 JSON。\
开拓者、三月七必须按命途区分，不得把不同命途的套装或词条混到同一个角色上。\
角色机制与硬约束优先于一切旧攻略；若不同攻略存在版本差异或角色改版，一律以当前版本机制和较新攻略为准，不要沿用过时套装或改版前的旧倍率。\
只有在明显缺少攻略依据或存在流派分歧需要玩家留意时，才在 warnings 中给出 1～2 句简短提醒，不要逐项写免责声明。只输出一个 JSON 对象，不要 Markdown。\n\n"
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
    // Strip saved_plan before serializing so outdated or erroneous form values
    // never anchor the model's fresh current-version recommendation.
    let mut clean_snapshot = snapshot.clone();
    clean_snapshot.saved_plan = None;
    let snapshot_json = serde_json::to_string_pretty(&clean_snapshot)?;
    let version = current_game_version();

    let mut body = format!("请综合以下材料，生成崩坏：星穹铁道 v{version} 的配装建议 JSON。\n\n");
    body.push_str("## 角色机制与硬约束（最高优先级事实）\n");
    body.push_str(&format!("- 当前客户端数据版本：v{version}\n"));
    body.push_str(&format!("- 角色：{}\n", snapshot.display_name));
    if !profile.element.is_empty() {
        body.push_str(&format!("- 属性：{}\n", profile.element));
    }
    if let Some(speed) = profile.base_speed {
        body.push_str(&format!("- 80 级基础速度：{speed:.0}\n"));
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
        body.push_str("- 当前版本核心技能摘录：\n");
        for line in &profile.skill_summary {
            body.push_str(&format!("  * {line}\n"));
        }
    }

    body.push_str("\n## 本地角色与装备（不含旧方案，避免锚定偏差）\n");
    body.push_str(&snapshot_json);

    body.push_str("\n\n## 检索结果（如含发布日期，优先采信较新攻略）\n");
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
                "{}. {date_tag}{} | {} | {}\n",
                index + 1,
                hit.title,
                hit.url,
                hit.snippet
            ));
        }
    }

    body.push_str("\n## 页面摘录\n");
    if pages.is_empty() {
        body.push_str("（未能抓取页面正文）\n");
    } else {
        for page in pages {
            body.push_str(&format!(
                "### {} ({})\n{}\n\n",
                page.title, page.url, page.text
            ));
        }
    }
    if let Some(warning) = search_warning {
        body.push_str("\n## 检索提示\n");
        body.push_str(warning);
        body.push('\n');
    }

    body.push_str(
        r#"
## 输出 JSON
{
  "summary": "一两句说明当前版本为什么这样配",
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
    "note": ""
  },
  "sources": [{ "title": "", "url": "" }],
  "warnings": []
}
关键表单规则（必须遵守）：
1. 套装必须用上面清单里的 id；优先采用最新且契合角色机制的毕业套装，避免旧版过渡套。
2. 权重只能是 0/0.25/0.5/0.75/1，非零最多 5 个；effectiveSubstats 必须等于 substatWeights 里非零键，按权重从高到低。
3. 评分器已按对应百分比权重的 40% 自动折算小生命/小攻击/小防御，因此不要给 HP / ATK / DEF 小词条单独设权重。
4. spdTarget 表示「最低达标速度门槛」（如 134/143/160），不是速度上限！低速角色、反击角色或穿「哀歌覆国的诗人」4 件套时，spdTarget 必须填 0，且不要给 SPD 设权重或穿速度鞋。
5. 纯生命/纯防御倍率角色不得给 ATK / ATK% 设权重或主词条；持续伤害角色用攻击%、速度、效果命中，不要给暴击/暴伤/击破；超击破角色不要给双暴。
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
    }
}
