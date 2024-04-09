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
        "children": {
            # 副本对应识别图片名称
            "嗔怒之形": "Anger",
            "空海之形": "AirSea",
            "巽风之形": "SundaWind",
            "鸣雷之形": "Thunder",
            "炎华之形": "YanFlame",
            "锋芒之形": "CuttingEdge",
            "霜晶之形": "FrostCrystal",
            "幻光之形": "PhantomLight",
            "冰棱之形": "IceEdge",
            "震厄之形": "DefyMisfortune",
            "偃偶之形": "Concubine",
            "孽兽之形": "EvilBeast",
            "燔灼之形": "BurntBurn",
            "天人之形": "HeavenAndMan",
            "幽府之形": "EtherealResidence",
            "焦炙之形": "Scorching",
            "冰酿之形": "IceBrewing"
        }
    },
    "遗器": {
        "parent_name": "遗器",
        "simple_name": "equip",
        "strategy_class": "AdvanceStrategy",
        "max_count": 99,
        "children": {
            "霜风之径": "",
            "迅拳之径": "",
            "漂泊之径": "",
            "睿治之径": "",
            "圣颂之径": "",
            "野焰之径": "",
            "药使之径": "",
            "幽冥之径": "",
            "梦潜之径": ""
        }
    },
    "历战余响": {
        "parent_name": "历战余响",
        "simple_name": "weekend",
        "strategy_class": "AdvanceStrategy",
        "max_count": 3,
        "children": {
            "毁灭的开端": "",
            "寒潮的落幕": "",
            "不死的神实": "",
            "蛀星的旧靥": ""
        }
    }
}
