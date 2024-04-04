"""
副本列表配置
"""
dungeon_list = [
    {
        "parent_name": "角色经验",
        "strategy_class": "ExpStrategy",
        "max_count": 6,
        "children": [
            "雅利洛",
            "仙舟",
            "匹诺康尼"
        ]
    },
    {
        "parent_name": "武器经验",
        "strategy_class": "WeaponStrategy",
        "children": [
            "雅利洛",
            "仙舟",
            "匹诺康尼"
        ]
    },
    {
        "parent_name": "信用点",
        "strategy_class": "MoneyStrategy",
        "children": [
            "雅利洛",
            "仙舟",
            "匹诺康尼"
        ]
    },
    {
        "parent_name": "行迹材料",
        "strategy_class": "",
        "children": [
            "开发中"
        ]
    },
    {
        "parent_name": "晋级材料",
        "strategy_class": "",
        "children": [
            "开发中"
        ]
    },
    {
        "parent_name": "遗器",
        "strategy_class": "",
        "children": [
            "开发中"
        ]
    },
    {
        "parent_name": "历战余响",
        "strategy_class": "",
        "children": [
            "开发中"
        ]
    }
]
