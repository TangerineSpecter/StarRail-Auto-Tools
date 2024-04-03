"""
快捷键模块
"""
import keyboard
import pyautogui

from Strategy.MainStrategy import Strategy


class KeyboardModule:

    def __init__(self, MainWindow):
        self.MainWindow = MainWindow

    def bind_start_game(self):
        """
        启动游戏快捷键
        """
        keyboard.add_hotkey('shift+r', lambda: Strategy(self.MainWindow).run_game())

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
