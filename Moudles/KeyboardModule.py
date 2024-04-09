"""
快捷键模块
"""
import keyboard
import pyautogui
import Utils.Constant as Constant


class KeyboardModule:

    def __init__(self, worker):
        # 线程初始化和槽绑定
        self.worker = worker

    def bind_start_game(self):
        """
        启动游戏快捷键
        """
        keyboard.add_hotkey(Constant.start_keyboard, lambda: self.worker.start())
        keyboard.add_hotkey(Constant.stop_keyboard, lambda: self.worker.stop())

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
