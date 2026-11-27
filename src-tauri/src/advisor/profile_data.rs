use std::collections::HashMap;
use std::sync::OnceLock;

use serde::Deserialize;

#[derive(Debug, Deserialize)]
struct CharacterCatalogueFile {
    characters: Vec<CharacterCatalogueEntry>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CharacterCatalogueEntry {
    pub(crate) slug: String,
    pub(crate) name: String,
    #[serde(default)]
    pub(crate) path: String,
    #[serde(default)]
    pub(crate) element: String,
    #[serde(default)]
    pub(crate) base_stats: Option<CharacterBaseStats>,
    #[serde(default)]
    pub(crate) trace_stats: Vec<CharacterTraceStat>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct CharacterBaseStats {
    #[serde(default)]
    pub(crate) hp: Option<f64>,
    #[serde(default)]
    pub(crate) attack: Option<f64>,
    #[serde(default)]
    pub(crate) defense: Option<f64>,
    #[serde(default)]
    pub(crate) speed: Option<f64>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct CharacterTraceStat {
    #[serde(default)]
    pub(crate) stats: Vec<TraceStatEntry>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct TraceStatEntry {
    #[serde(default)]
    pub(crate) key: String,
    #[serde(default)]
    pub(crate) value: f64,
}

#[derive(Debug, Deserialize)]
struct MechanicsFile {
    abilities: Vec<MechanicAbility>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MechanicAbility {
    pub(crate) owner_id: String,
    #[serde(default)]
    pub(crate) source_node_id: String,
    #[serde(default)]
    pub(crate) slot: String,
    #[serde(default)]
    pub(crate) name: String,
    #[serde(default)]
    pub(crate) description_template: String,
    #[serde(default)]
    pub(crate) parameters: HashMap<String, MechanicParameter>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct MechanicParameter {
    #[serde(default)]
    pub(crate) kind: String,
    #[serde(default)]
    pub(crate) value: Option<f64>,
    #[serde(default)]
    pub(crate) levels: Vec<u32>,
    #[serde(default)]
    pub(crate) values: Vec<f64>,
}

pub(crate) fn character_catalogue() -> &'static [CharacterCatalogueEntry] {
    static CATALOGUE: OnceLock<Vec<CharacterCatalogueEntry>> = OnceLock::new();
    CATALOGUE.get_or_init(|| {
        serde_json::from_str::<CharacterCatalogueFile>(include_str!(
            "../../../src/data/characters.json"
        ))
        .expect("bundled character catalogue must be valid")
        .characters
    })
}

pub(crate) fn mechanics_by_owner() -> &'static HashMap<String, Vec<MechanicAbility>> {
    static MECHANICS: OnceLock<HashMap<String, Vec<MechanicAbility>>> = OnceLock::new();
    MECHANICS.get_or_init(|| {
        let parsed = serde_json::from_str::<MechanicsFile>(include_str!(
            "../../../src/data/catalogue-mechanics.json"
        ))
        .expect("bundled mechanics catalogue must be valid");
        let mut grouped: HashMap<String, Vec<MechanicAbility>> = HashMap::new();
        for ability in parsed.abilities {
            if matches!(
                ability.slot.as_str(),
                "basic"
                    | "skill"
                    | "ult"
                    | "talent"
                    | "trace"
                    | "elation"
                    | "memospriteSkill"
                    | "memospriteTalent"
            ) && !ability.description_template.trim().is_empty()
            {
                grouped
                    .entry(ability.owner_id.clone())
                    .or_default()
                    .push(ability);
            }
        }
        grouped
    })
}

pub(crate) fn find_catalogue_entry<'a>(
    slug: &str,
    name: &str,
) -> Option<&'a CharacterCatalogueEntry> {
    let trimmed_slug = slug.trim();
    if !trimmed_slug.is_empty() {
        if let Some(entry) = character_catalogue()
            .iter()
            .find(|item| item.slug.eq_ignore_ascii_case(trimmed_slug))
        {
            return Some(entry);
        }
    }
    let trimmed_name = name.trim();
    if trimmed_name.is_empty() {
        return None;
    }
    let matches: Vec<_> = character_catalogue()
        .iter()
        .filter(|item| item.name == trimmed_name)
        .collect();
    if matches.len() == 1 {
        Some(matches[0])
    } else {
        None
    }
}

pub(crate) fn collect_character_abilities(character_id: u32) -> Vec<&'static MechanicAbility> {
    let map = mechanics_by_owner();
    let mut out = Vec::new();
    for owner_id in [
        format!("character:{character_id}"),
        format!("character:{character_id}/servant"),
    ] {
        if let Some(abilities) = map.get(&owner_id) {
            out.extend(abilities.iter());
        }
    }
    // Sort traces by descending numeric source_node_id (keeping non-traces intact)
    // so newer 8-digit buffed trace IDs (e.g. 11005101) always precede legacy 7-digit
    // IDs (e.g. 1005101) even when they are not adjacent in the JSON array.
    out.sort_by_key(|ability| {
        if ability.slot == "trace" {
            (
                0u8,
                std::cmp::Reverse(ability.source_node_id.parse::<u64>().unwrap_or(0)),
            )
        } else {
            (1u8, std::cmp::Reverse(0))
        }
    });
    out
}

pub(crate) fn summarize_minor_traces(traces: &[CharacterTraceStat]) -> Vec<String> {
    let mut totals: Vec<(String, f64)> = Vec::new();
    for trace in traces {
        for stat in &trace.stats {
            if stat.key.is_empty() || stat.value <= 0.0 {
                continue;
            }
            if let Some(existing) = totals.iter_mut().find(|(key, _)| key == &stat.key) {
                existing.1 += stat.value;
            } else {
                totals.push((stat.key.clone(), stat.value));
            }
        }
    }
    totals
        .into_iter()
        .map(|(key, value)| {
            if key == "速度" {
                format!("{key} +{:.0}", value.round())
            } else {
                format!("{key} +{:.1}%", value * 100.0)
            }
        })
        .collect()
}

pub(crate) fn render_ability_text(ability: &MechanicAbility) -> String {
    let tpl = &ability.description_template;
    let mut out = String::with_capacity(tpl.len());
    let mut rest = tpl.as_str();
    while let Some(open) = rest.find('{') {
        out.push_str(&rest[..open]);
        let after_open = &rest[open + 1..];
        let Some(close) = after_open.find('}') else {
            out.push('{');
            rest = after_open;
            continue;
        };
        let token = &after_open[..close];
        if let Some((key, fmt)) = token.split_once(':') {
            if let Some(param) = ability.parameters.get(key) {
                out.push_str(&format_param_value(param, fmt));
            } else {
                out.push_str("一定比例");
            }
        } else {
            out.push_str("一定比例");
        }
        rest = &after_open[close + 1..];
    }
    out.push_str(rest);
    out.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn format_param_value(param: &MechanicParameter, fmt: &str) -> String {
    let value = if param.kind == "constant" {
        param.value
    } else if param.kind == "table" {
        if let Some(idx) = param.levels.iter().position(|lv| *lv == 10) {
            param.values.get(idx).copied()
        } else if param.levels.len() <= 10 {
            param
                .levels
                .iter()
                .position(|lv| *lv == 6)
                .and_then(|idx| param.values.get(idx).copied())
                .or_else(|| param.values.last().copied())
        } else {
            param.values.last().copied()
        }
    } else {
        param.value
    };
    let Some(val) = value else {
        return "一定比例".to_owned();
    };
    match fmt {
        "percentInteger" => format!("{}%", (val * 100.0).round() as i64),
        "percentFixed1" => format!("{:.1}%", val * 100.0),
        "percentFixed2" => format!("{:.2}%", val * 100.0),
        "fixed1" => format!("{val:.1}"),
        "integer" => format!("{}", val.round() as i64),
        _ => {
            if (val - val.round()).abs() < 1e-6 {
                format!("{}", val.round() as i64)
            } else {
                format!("{val:.2}")
            }
        }
    }
}
