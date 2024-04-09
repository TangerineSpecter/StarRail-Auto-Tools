"""
坐标配置信息
"""


class BtnKey:
    """
    按钮坐标key
    """
    close_btn = "close_btn"
    '''关闭按钮'''
    dungeon_main = "dungeon_main"
    '''主界面-副本按钮'''

    dungeon_tab = "dungeon_tab"
    '''副本界面-tab按钮'''
    base_row = "base_row"
    '''副本界面-基础栏目选项'''
    skill_row = "skill_row"
    '''副本界面-技能材料栏目选项'''
    rank_row = "rank_row"
    '''副本界面-晋级材料栏目选项'''
    equip_row = "equip_row"
    '''副本界面-遗器栏目选项'''
    weekend_row = "weekend_row"
    '''副本界面-周本栏目选项'''

    exp_run_btn = "exp_run_btn"
    '''基础副本-角色经验传送按钮'''
    weapon_run_btn = "weapon_run_btn"
    '''基础副本-武器经验传送按钮'''
    money_run_btn = "money_run_btn"
    '''基础副本-信用点传送按钮'''

    dungeon_retry = "dungeon_retry"
    '''战斗界面-重试按钮'''
    dungeon_exit = "dungeon_exit"
    '''战斗界面-退出按钮'''
    action_btn = "action_btn"
    '''战斗界面-挑战开始'''
    action_count_btn = "action_count_btn"
    '''战斗界面-挑战次数设置'''


def get_dungeon_row(row_name):
    """
    获取副本栏目key
    :param row_name: 栏目名称
    :return:
    """
    return getattr(BtnKey, f"{row_name}_row", None)


def get_base_run(run_name):
    """
    获取副本传送按钮key
    :param run_name: 传送副本名称
    :return:
    """
    return getattr(BtnKey, f"{run_name}_run_btn", None)


coordinate_info = {
    BtnKey.close_btn: {
        "x": 0.9734,
        "y": 0.0444
    },
    # 主窗口副本按钮
    BtnKey.dungeon_main: {
        "x": 0.834,
        "y": 0.045
    },
    # 弹窗副本tab页
    BtnKey.dungeon_tab: {
        "x": 0.309,
        "y": 0.194
    },
    # 基础副本选项
    BtnKey.base_row: {
        "x": 0.286,
        "y": 0.451
    },
    # 技能材料副本选项
    BtnKey.skill_row: {
        "x": 0.229,
        "y": 0.568
    },
    # 晋级材料副本选项
    BtnKey.rank_row: {
        "x": 0.253,
        "y": 0.695
    },
    # 遗器副本选项(滚动坐标)
    BtnKey.equip_row: {
        "x": 0.226,
        "y": 0.646
    },
    # 周本选项(滚动坐标)
    BtnKey.weekend_row: {
        "x": 0.239,
        "y": 0.755
    },

    # 副本结束重试按钮
    BtnKey.dungeon_retry: {
        "x": 0.618,
        "y": 0.877
    },
    # 副本结束退出按钮
    BtnKey.dungeon_exit: {
        "x": 0.3769,
        "y": 0.8784
    },
    # 挑战开始按钮
    BtnKey.action_btn: {
        "x": 0.85,
        "y": 0.9
    },
    # 挑战次数按钮
    BtnKey.action_count_btn: {
        "x": 0.95,
        "y": 0.83
    },

    # 角色经验-传送
    BtnKey.exp_run_btn: {
        "x": 0.787,
        "y": 0.459
    },
    # 武器经验-传送
    BtnKey.weapon_run_btn: {
        "x": 0.787,
        "y": 0.641
    },
    # 信用点-传送
    BtnKey.money_run_btn: {
        "x": 0.787,
        "y": 0.828
    }
}
