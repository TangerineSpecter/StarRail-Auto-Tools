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
        keyboard.add_hotkey('shift+d', print("鼠标当前坐标：", pyautogui.position()))
