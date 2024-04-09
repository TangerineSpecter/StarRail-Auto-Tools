"""
数据处理工具类
"""

import pyautogui
from PySide6.QtCore import QSettings

import Config.CoordinateConfig as CoordinateConfig

# 创建 QSettings 对象，将 parent 参数设置为 None
settings = QSettings("MyCompany", "MyApp", parent=None)

# 获取屏幕分辨率
screen_width, screen_height = pyautogui.size()

# 默认点间隔
duration = 0.3

# 位置坐标信息
positionInfo = CoordinateConfig.coordinate_info


def getPosition(position_name):
    """
    获取指定的坐标位置
    :param position_name: 坐标名称
    :return: x轴坐标，y轴坐标
    """
    return screen_width * positionInfo[position_name]['x'], screen_height * positionInfo[position_name]['y']
