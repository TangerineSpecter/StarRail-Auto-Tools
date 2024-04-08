"""
快捷键模块
"""
import keyboard
import pyautogui

import Config.LoggingConfig as Logging
from Strategy.MainStrategy import Strategy


class KeyboardModule:

    def __init__(self, MainWindow):
        self.MainWindow = MainWindow
        # 线程初始化和槽绑定
        self.worker = Strategy(MainWindow)
        self.worker.sinOut.connect(self.MainWindow.showMsg)

    def bind_start_game(self):
        """
        启动游戏快捷键
        """
        keyboard.add_hotkey('shift+r', lambda: self.worker.start())
        keyboard.add_hotkey('shift+f', lambda: self.worker.stop())

    def bind_position(self):
        """
        鼠标定位快捷键
        """
        keyboard.add_hotkey('shift+d', lambda: printPosition())


def printPosition():
    position = pyautogui.position()
    print(f"鼠标当前坐标：{position}")
    x, y = pyautogui.size()
    print(f"坐标百分比：x={position.x / x}，y={position.y / y}")
