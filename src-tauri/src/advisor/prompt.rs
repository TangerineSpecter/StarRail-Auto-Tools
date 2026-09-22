use super::context::CharacterAdviceSnapshot;
use super::fetch::FetchedPage;
use super::sanitize::form_contract_text;
use super::search::SearchHit;

pub fn system_prompt() -> String {
    "你是崩坏：星穹铁道的培养方案助手。根据检索到的公开攻略和用户当前装备，生成一份能直接填进毕业目标表单的 JSON。\
开拓者、三月七必须按命途区分，不得把不同命途的套装或词条混到同一个角色上。\
只依据提供的材料作答；没有依据时写入 warnings。只输出一个 JSON 对象，不要 Markdown。\n\n"
        .to_owned()
        + &form_contract_text()
}

pub fn user_prompt(
    snapshot: &CharacterAdviceSnapshot,
    hits: &[SearchHit],
    pages: &[FetchedPage],
    search_warning: Option<&str>,
) -> Result<String, serde_json::Error> {
    let snapshot_json = serde_json::to_string_pretty(snapshot)?;
    let mut body = String::from("请综合以下材料，输出配装建议 JSON。\n\n");
    body.push_str("## 本地角色与装备\n");
    body.push_str(&snapshot_json);
    body.push_str("\n\n## 检索结果\n");
    if hits.is_empty() {
        body.push_str("（无检索结果）\n");
    } else {
        for (index, hit) in hits.iter().enumerate() {
            body.push_str(&format!(
                "{}. {} | {} | {}\n",
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
  "summary": "一两句说明为什么这样配",
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
    "spdTarget": 134,
    "note": ""
  },
  "sources": [{ "title": "", "url": "" }],
  "warnings": []
}
套装必须用上面清单里的 id。权重只能是 0/0.25/0.5/0.75/1。
effectiveSubstats 必须等于 substatWeights 里非零键，按权重从高到低。
持续伤害角色（卡芙卡、黑天鹅、桑博、卢卡、桂乃芬）用攻击%、速度、效果命中，不要给暴击、暴伤、击破。
虚无上 debuff 辅助用速度+效果命中。不要把直伤双暴模板套到 DoT 角色上。
"#,
    );
    Ok(body)
}
