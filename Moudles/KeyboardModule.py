"""
快捷键模块
"""
import keyboard
from Strategy.MainStrategy import Strategy


class KeyboardModule:

    def __init__(self, QWidget, game_path):
        self.QWidget = QWidget
        self.game_path = game_path

    def bind_start_game(self):
        keyboard.add_hotkey('shift+r', lambda: Strategy(self.QWidget, self.game_path).run_game())
