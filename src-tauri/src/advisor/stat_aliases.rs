pub(crate) const SUBSTAT_KEYS: &[&str] = &[
    "HP",
    "ATK",
    "DEF",
    "HP%",
    "ATK%",
    "DEF%",
    "SPD",
    "CRIT Rate",
    "CRIT DMG",
    "Effect Hit Rate",
    "Effect RES",
    "Break Effect",
];

pub(crate) const TARGET_KEYS: &[&str] = &[
    "HP",
    "ATK",
    "DEF",
    "SPD",
    "CRIT Rate",
    "CRIT DMG",
    "Effect Hit Rate",
    "Effect RES",
    "Break Effect",
];

pub(crate) const MAIN_SLOTS: &[(&str, &[&str])] = &[
    (
        "Body",
        &[
            "HP%",
            "ATK%",
            "DEF%",
            "CRIT Rate",
            "CRIT DMG",
            "Outgoing Healing Boost",
            "Effect Hit Rate",
        ],
    ),
    ("Feet", &["HP%", "ATK%", "DEF%", "SPD"]),
    (
        "PlanarSphere",
        &[
            "HP%",
            "ATK%",
            "DEF%",
            "Physical DMG Boost",
            "Fire DMG Boost",
            "Ice DMG Boost",
            "Lightning DMG Boost",
            "Wind DMG Boost",
            "Quantum DMG Boost",
            "Imaginary DMG Boost",
        ],
    ),
    (
        "LinkRope",
        &[
            "HP%",
            "ATK%",
            "DEF%",
            "Break Effect",
            "Energy Regeneration Rate",
        ],
    ),
];

pub(crate) fn resolve_stat<'a>(
    raw: &str,
    allowed: &'a [&str],
    prefer_percent: bool,
) -> Option<&'a str> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }
    allowed
        .iter()
        .copied()
        .find(|item| item.eq_ignore_ascii_case(trimmed))
        .or_else(|| {
            stat_alias(trimmed, prefer_percent)
                .and_then(|alias| allowed.iter().copied().find(|item| *item == alias))
        })
}

pub(crate) fn slot_alias(raw: &str) -> Option<&'static str> {
    Some(match raw {
        "Body" | "body" | "躯干" | "衣服" => "Body",
        "Feet" | "feet" | "脚部" | "鞋子" => "Feet",
        "PlanarSphere" | "sphere" | "位面球" | "球" => "PlanarSphere",
        "LinkRope" | "rope" | "连结绳" | "绳子" => "LinkRope",
        _ => return None,
    })
}

fn stat_alias(raw: &str, prefer_percent: bool) -> Option<&'static str> {
    let normalized = raw.trim().to_ascii_lowercase();
    Some(match normalized.as_str() {
        "生命值" | "生命" | "hp" => {
            if prefer_percent {
                "HP%"
            } else {
                "HP"
            }
        }
        "生命百分比" | "生命%" | "hp%" | "hp %" => "HP%",
        "攻击力" | "攻击" | "atk" => {
            if prefer_percent {
                "ATK%"
            } else {
                "ATK"
            }
        }
        "攻击百分比" | "攻击%" | "atk%" | "atk %" => "ATK%",
        "防御力" | "防御" | "def" => {
            if prefer_percent {
                "DEF%"
            } else {
                "DEF"
            }
        }
        "防御百分比" | "防御%" | "def%" | "def %" => "DEF%",
        "速度" | "speed" | "spd" => "SPD",
        "暴击率" | "暴击" | "crit rate" | "cr" => "CRIT Rate",
        "暴击伤害" | "暴伤" | "crit dmg" | "crit damage" | "cd" | "cdmg" => "CRIT DMG",
        "效果命中" | "命中" | "effect hit rate" | "ehr" => "Effect Hit Rate",
        "效果抵抗" | "抵抗" | "effect res" | "effect resistance" | "eres" => "Effect RES",
        "击破特攻" | "击破" | "break effect" | "break" | "be" => "Break Effect",
        "治疗量加成"
        | "治疗加成"
        | "治疗量"
        | "治疗"
        | "outgoing healing"
        | "outgoing healing boost"
        | "healing boost"
        | "healing"
        | "ohb" => "Outgoing Healing Boost",
        "能量恢复效率"
        | "能量回复效率"
        | "能量恢复"
        | "能量回复"
        | "充能效率"
        | "充能"
        | "energy regen rate"
        | "energy regen"
        | "energy regeneration"
        | "energy regeneration rate"
        | "err"
        | "er" => "Energy Regeneration Rate",
        "风伤" | "风属性伤害提高" | "风属性伤害" | "wind dmg" | "wind dmg%" | "wind damage" => {
            "Wind DMG Boost"
        }
        "火伤" | "火属性伤害提高" | "火属性伤害" | "fire dmg" | "fire dmg%" | "fire damage" => {
            "Fire DMG Boost"
        }
        "冰伤" | "冰属性伤害提高" | "冰属性伤害" | "ice dmg" | "ice dmg%" | "ice damage" => {
            "Ice DMG Boost"
        }
        "雷伤"
        | "雷属性伤害提高"
        | "雷属性伤害"
        | "lightning dmg"
        | "lightning dmg%"
        | "lightning damage" => "Lightning DMG Boost",
        "量子伤害" | "量子伤害提高" | "量子属性伤害" | "量子伤" | "quantum dmg"
        | "quantum dmg%" | "quantum damage" => "Quantum DMG Boost",
        "虚数伤害" | "虚数伤害提高" | "虚数属性伤害" | "虚数伤" | "imaginary dmg"
        | "imaginary dmg%" | "imaginary damage" => "Imaginary DMG Boost",
        "物理伤害" | "物理伤害提高" | "物理属性伤害" | "物理伤" | "物伤" | "physical dmg"
        | "physical dmg%" | "physical damage" => "Physical DMG Boost",
        _ => return None,
    })
}
