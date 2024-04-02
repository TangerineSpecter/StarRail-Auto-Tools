"""
快捷键模块
"""
import keyboard
from Strategy.MainStrategy import Strategy


class KeyboardModule:

    @staticmethod
    def bind_start_game(QWidget, game_path):
        keyboard.add_hotkey('ctrl+r', lambda: Strategy.run_game(QWidget, game_path))
