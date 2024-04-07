"""
副本列表配置
"""
dungeon_dict = {
    "角色经验": {
        "parent_name": "角色经验",
        "simple_name": "exp",
        "strategy_class": "BaseStrategy",
        "max_count": 6,
        "children": [
            "雅利洛",
            "仙舟",
            "匹诺康尼"
        ]
    },
    "武器经验": {
        "parent_name": "武器经验",
        "simple_name": "weapon",
        "strategy_class": "BaseStrategy",
        "max_count": 6,
        "children": [
            "雅利洛",
            "仙舟",
            "匹诺康尼"
        ]
    },
    "信用点": {
        "parent_name": "信用点",
        "simple_name": "money",
        "strategy_class": "BaseStrategy",
        "max_count": 6,
        "children": [
            "雅利洛",
            "仙舟",
            "匹诺康尼"
        ]
    },
    "行迹材料": {
        "parent_name": "行迹材料",
        "simple_name": "skill",
        "strategy_class": "AdvanceStrategy",
        "max_count": 6,
        "children": {
            # 副本对应识别图片名称
            "雅利洛": "BattleOver"
        }
    },
    "晋级材料": {
        "parent_name": "晋级材料",
        "simple_name": "rank",
        "strategy_class": "AdvanceStrategy",
        "max_count": 99,
        "children": [
            "开发中"
        ]
    },
    "遗器": {
        "parent_name": "遗器",
        "simple_name": "equip",
        "strategy_class": "AdvanceStrategy",
        "max_count": 99,
        "children": [
            "开发中"
        ]
    },
    "历战余响": {
        "parent_name": "历战余响",
        "simple_name": "weekend",
        "strategy_class": "AdvanceStrategy",
        "max_count": 3,
        "children": [
            "开发中"
        ]
    }
}
