"""
数据处理工具类
"""

import os
import sys

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


def getPosition(position_name: CoordinateConfig.BtnKey):
    """
    获取指定的坐标位置
    :param position_name: 坐标名称
    :return: x轴坐标，y轴坐标
    """
    position_info = positionInfo[position_name]
    if position_info is None:
        return None

    x = position_info['x']
    y = position_info['y']

    return screen_width * x, screen_height * y


def getResourcePath(file_path):
    """
    获取
    :param file_path: 文件路径
    :return: 路径
    """
    if hasattr(sys, "_MEIPASS"):
        return os.path.join(sys._MEIPASS, file_path)
    return file_path
