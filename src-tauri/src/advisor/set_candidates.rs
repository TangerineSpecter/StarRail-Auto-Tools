use super::fetch::FetchedPage;
use super::profile::{join_rendered_descriptions, ScalingMode};
use super::profile_data::MechanicAbility;
use super::search::SearchHit;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CandidateSetHint {
    pub set_id: u32,
    pub reason: &'static str,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GuideFreshness {
    Modern4x,
    Pre4xOrLegacy,
}

const MODERN_4X_KEYWORDS: &[&str] = &[
    "贪噬禁果",
    "天国@直播间",
    "星如我见",
    "叩问天工",
    "戏梦点星",
    "闪耀功勋",
    "应天涉远",
    "零号关卡",
    "千星荟萃",
    "坠星启航",
    "寰宇生研",
    "神的瞬息",
    "亚空异容",
    "edacious heretic",
    "tengoku",
    "diviner of distant reach",
    "magical girl",
    "punklorde",
    "v4.0",
    "v4.1",
    "v4.2",
    "v4.3",
    "v4.4",
    "v4.5",
    "v4.6",
    "v4.7",
    "4.5版本",
    "4.6版本",
    "4.7版本",
    "version 4.",
];

pub fn assess_guide_freshness(hits: &[SearchHit], pages: &[FetchedPage]) -> GuideFreshness {
    for hit in hits {
        if hit
            .published_at
            .as_deref()
            .is_some_and(|date| date.starts_with("2026-") || date.starts_with("2027-"))
        {
            return GuideFreshness::Modern4x;
        }
        if contains_4x_signal(&hit.title)
            || contains_4x_signal(&hit.snippet)
            || hit.content.as_deref().is_some_and(contains_4x_signal)
        {
            return GuideFreshness::Modern4x;
        }
    }
    for page in pages {
        if contains_4x_signal(&page.title) || contains_4x_signal(&page.text) {
            return GuideFreshness::Modern4x;
        }
    }
    GuideFreshness::Pre4xOrLegacy
}

fn contains_4x_signal(text: &str) -> bool {
    if text.is_empty() {
        return false;
    }
    let lower = text.to_ascii_lowercase();
    MODERN_4X_KEYWORDS
        .iter()
        .any(|keyword| lower.contains(keyword))
}

pub(crate) fn infer_candidate_sets(
    abilities: &[&MechanicAbility],
    path_zh: &str,
    scaling_mode: ScalingMode,
    is_elation: bool,
    low_speed_preferred: bool,
    base_speed: Option<f64>,
) -> Vec<CandidateSetHint> {
    if abilities.is_empty() {
        return Vec::new();
    }

    let full_text = join_rendered_descriptions(abilities, |slot| {
        matches!(
            slot,
            "basic"
                | "skill"
                | "ult"
                | "talent"
                | "trace"
                | "elation"
                | "memospriteSkill"
                | "memospriteTalent"
        )
    });
    let skill_ult_text =
        join_rendered_descriptions(abilities, |slot| matches!(slot, "skill" | "ult"));
    let basic_count = abilities
        .iter()
        .filter(|ability| ability.slot == "basic")
        .count();
    let has_enhanced_basic = basic_count >= 2
        || full_text.contains("强化普攻")
        || full_text.contains("普攻的效果得到强化");
    let heavy_sp_consumer = full_text.contains("最多可连续强化3次")
        || full_text.contains("琼玉牌")
        || (full_text.contains("消耗") && full_text.contains("战技点") && has_enhanced_basic);
    let targets_single_ally = skill_ult_text.contains("指定我方单体")
        || skill_ult_text.contains("我方其他单体")
        || skill_ult_text.contains("指定我方单个");
    let is_healer = path_zh == "丰饶"
        || (full_text.contains("治疗")
            && full_text.contains("回复")
            && (full_text.contains("我方单体") || full_text.contains("我方全体")));
    let is_shielder = path_zh == "存护" && full_text.contains("护盾");
    let is_dps_path = matches!(path_zh, "毁灭" | "巡猎" | "智识" | "记忆" | "欢愉");
    let has_fua = full_text.contains("追加攻击") && is_dps_path;
    let has_summon = full_text.contains("召唤【") || path_zh == "记忆";
    let applies_def_shred = full_text.contains("防御力降低");

    let mut cavern = Vec::new();
    let mut planar = Vec::new();

    if is_elation {
        if targets_single_ally {
            push_unique(&mut cavern, 133, "欢愉单体拐提供目标欢愉度+全队暴伤");
            push_unique(&mut planar, 329, "欢愉度≥40%开局拉条40%抢先手");
        }
        push_unique(&mut cavern, 129, "欢愉伤害高额无视防御");
        push_unique(&mut cavern, 130, "120/160速暴击率+首次欢愉技全队欢愉度");
        push_unique(&mut planar, 325, "欢愉度40%/80%高额暴伤");
    }

    match scaling_mode {
        ScalingMode::BreakOnly => {
            push_unique(&mut cavern, 119, "击破/超击破无视防御，击破C首选");
            push_unique(&mut planar, 316, "提速+击破特攻");
            push_unique(&mut planar, 330, "高速击破辅助提供全队击破特攻");
        }
        ScalingMode::Dot => {
            push_unique(&mut cavern, 116, "持续伤害无视最高18%防御");
            push_unique(
                &mut planar,
                322,
                "攻击≥2400/3600提12%/24%持续伤害，优于旧版苍穹/太空",
            );
        }
        ScalingMode::HpOnly if !is_healer => {
            if low_speed_preferred || base_speed.is_some_and(|speed| speed <= 98.0) {
                push_unique(&mut cavern, 124, "低速(<95)常驻+32%暴击率");
            }
            if path_zh == "记忆" {
                push_unique(&mut cavern, 127, "忆灵在场生命+24%且全队增伤15%");
                push_unique(&mut planar, 321, "场上多单位提供高额增伤");
            } else {
                if has_enhanced_basic {
                    push_unique(&mut cavern, 113, "生命+12%且烧血/受击叠16%暴击率");
                }
                push_unique(
                    &mut cavern,
                    122,
                    "暴击+8%且战技/终结技高额增伤（不浪费攻击词条）",
                );
            }
            push_unique(
                &mut planar,
                319,
                "生命+12%且生命≥5000提供+28%暴伤，生命C首选内圈",
            );
        }
        _ => {}
    }

    if is_shielder {
        push_unique(
            &mut cavern,
            128,
            "盾量+22%且护盾目标暴伤+15%，全面优于旧版圣骑士",
        );
        push_unique(&mut planar, 317, "充能5%+给1号位主C+12%攻击");
    }

    if is_healer {
        push_unique(
            &mut cavern,
            125,
            "提速12%+治疗触发全队+15%暴伤，优于过客/信使",
        );
        push_unique(&mut planar, 320, "提速6%+135/180速高额治疗量加成");
        push_unique(&mut planar, 317, "充能5%+给1号位主C+12%攻击");
    }

    if path_zh == "同谐" && !is_elation {
        if targets_single_ally {
            push_unique(
                &mut cavern,
                121,
                "单体战技/终结技给主C叠最高36%暴伤，优于信使",
            );
        }
        push_unique(&mut planar, 317, "充能5%+给1号位主C+12%攻击");
    }

    if path_zh == "记忆" && scaling_mode != ScalingMode::HpOnly && !is_healer {
        push_unique(&mut cavern, 127, "忆灵在场提供全队+15%增伤");
        push_unique(&mut cavern, 123, "忆灵在场提速+30%暴伤");
        push_unique(&mut planar, 318, "存在召唤物/忆灵常驻+48%暴伤");
        push_unique(&mut planar, 323, "暴击+8%且忆灵在场全队提速8%");
    }

    if scaling_mode == ScalingMode::Standard && !is_elation && !is_healer && !is_shielder {
        if has_enhanced_basic && is_dps_path {
            push_unique(
                &mut cavern,
                134,
                "暴伤+16%、普攻增伤+36%、普攻后攻击+20%，全面碾压旧版快枪手",
            );
            if heavy_sp_consumer {
                push_unique(
                    &mut planar,
                    324,
                    "单回合耗≥3战技点常驻+48%暴伤，与繁星按暴击缺口择优",
                );
            }
            push_unique(
                &mut planar,
                309,
                "暴击+8%+普攻/战技增伤+20%（暴击缺口大时更稳）",
            );
        }

        if has_fua {
            push_unique(&mut cavern, 115, "追击增伤+高频追击叠高额攻击力");
            push_unique(&mut cavern, 120, "暴击+6%+追击触发终结技+36%增伤");
            if has_summon {
                push_unique(&mut planar, 318, "存在召唤物常驻+48%暴伤（如神君/账账）");
            }
            push_unique(&mut planar, 315, "追击叠满25%追击增伤+25%暴伤");
            push_unique(&mut planar, 326, "追击+24%攻击且击杀提供全队+12%暴伤");
        }

        if applies_def_shred && (path_zh == "虚无" || is_dps_path) {
            push_unique(&mut cavern, 132, "对减防敌+28%暴伤且挂减防触发全队+15%增伤");
        }

        if matches!(path_zh, "毁灭" | "巡猎" | "智识") && !has_enhanced_basic && !has_fua {
            push_unique(
                &mut cavern,
                122,
                "暴击+8%+战技/终结技增伤，常优于早期属性4件套",
            );
            push_unique(&mut cavern, 131, "攻击+12%+战技/终结技多层增伤");
        }
    }

    cavern.truncate(4);
    planar.truncate(3);
    cavern.extend(planar);
    cavern
}

fn push_unique(list: &mut Vec<CandidateSetHint>, set_id: u32, reason: &'static str) {
    if !list.iter().any(|item| item.set_id == set_id) {
        list.push(CandidateSetHint { set_id, reason });
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::advisor::profile::resolve_profile;

    fn candidate_ids(character_id: u32, name: &str, slug: &str, element: &str) -> Vec<u32> {
        resolve_profile(character_id, name, slug, element)
            .candidate_sets
            .into_iter()
            .map(|item| item.set_id)
            .collect()
    }

    #[test]
    fn matches_modern_sets_for_legacy_and_new_characters() {
        let dhil = candidate_ids(1213, "丹恒•饮月", "danhengil", "虚数");
        assert!(
            dhil.contains(&134),
            "DHIL should consider Edacious Heretic: {dhil:?}"
        );
        assert!(
            dhil.contains(&324),
            "DHIL should consider Tengoku@Livestream: {dhil:?}"
        );

        let qingque = candidate_ids(1201, "青雀", "qingque", "量子");
        assert!(
            qingque.contains(&134),
            "Qingque should consider Edacious Heretic: {qingque:?}"
        );
        assert!(
            qingque.contains(&324),
            "Qingque should consider Tengoku@Livestream: {qingque:?}"
        );

        let jingyuan = candidate_ids(1204, "景元", "jingyuan", "雷");
        assert!(
            jingyuan.contains(&115),
            "Jing Yuan should consider Grand Duke: {jingyuan:?}"
        );
        assert!(
            jingyuan.contains(&318),
            "Jing Yuan should consider BananAmusement: {jingyuan:?}"
        );

        let jingliu = candidate_ids(1212, "镜流", "jingliu", "冰");
        assert!(
            jingliu.contains(&122),
            "Buffed Jingliu should consider Scholar: {jingliu:?}"
        );
        assert!(
            jingliu.contains(&319),
            "Buffed Jingliu should consider Bone Collection: {jingliu:?}"
        );

        let huohuo = candidate_ids(1217, "藿藿", "huohuo", "风");
        assert!(
            huohuo.contains(&125),
            "Huohuo should consider Warrior Goddess: {huohuo:?}"
        );
        assert!(
            huohuo.contains(&320),
            "Huohuo should consider Giant Tree: {huohuo:?}"
        );

        let sunday = candidate_ids(1313, "星期日", "sunday", "虚数");
        assert!(
            sunday.contains(&121),
            "Sunday should consider Sacerdos: {sunday:?}"
        );

        let robin = candidate_ids(1309, "知更鸟", "robin", "物理");
        assert!(
            !robin.contains(&121),
            "Robin should NOT trigger single-target Sacerdos: {robin:?}"
        );

        let castorice = candidate_ids(1407, "遐蝶", "castorice", "量子");
        assert!(
            castorice.contains(&124),
            "Castorice should consider Poet: {castorice:?}"
        );
        assert!(
            castorice.contains(&319),
            "Castorice should consider Bone Collection: {castorice:?}"
        );
    }

    #[test]
    fn distinguishes_legacy_guides_from_modern_4x_guides() {
        let old_hits = [SearchHit {
            title: "丹恒饮月遗器攻略 快枪手4件套+繁星竞技场".to_owned(),
            url: "https://example.com/dhil-old".to_owned(),
            snippet: "推荐野穗伴行的快枪手，或哀歌覆国的诗人".to_owned(),
            content: None,
            published_at: Some("2025-02-01".to_owned()),
        }];
        assert_eq!(
            assess_guide_freshness(&old_hits, &[]),
            GuideFreshness::Pre4xOrLegacy
        );

        let modern_hits = [SearchHit {
            title: "丹恒饮月 4.6 新套装实测".to_owned(),
            url: "https://example.com/dhil-46".to_owned(),
            snippet: "贪噬禁果的异端 4 件套".to_owned(),
            content: None,
            published_at: Some("2026-09-15".to_owned()),
        }];
        assert_eq!(
            assess_guide_freshness(&modern_hits, &[]),
            GuideFreshness::Modern4x
        );
    }
}
