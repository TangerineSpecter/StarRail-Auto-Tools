import cv2
import psutil
import pyautogui
from PySide6.QtWidgets import (QMessageBox)

import Utils.Constant as Constant
from Strategy.ProcessStrategy import Context, ExpStrategy
from Utils.AudioUtils import AudioFactory


class Strategy:

    def __init__(self, QWidget, game_path):
        self.QWidget = QWidget
        self.game_path = game_path

    def run_game(self):
        # process = subprocess.Popen(game_path, stderr=subprocess.PIPE)
        # time.sleep(2)
        # 等待程序执行完成
        # process.communicate()

        try:
            print("执行主策略：开始比对")
            if check_process_exists(Constant.app_name):
                print("已运行")
                AudioFactory.play_audio(Constant.Audio.running)
                self.__init_window()
            else:
                self.__join_game()
        except Exception as e:
            print("未识别到图像")

        print("结束")

    def __join_game(self):
        """
        未运行，开始加入游戏策略
        """
        print("未运行，开始加入游戏")
        if len(self.game_path) <= 0:
            QMessageBox.information(self.QWidget, '提示', '未设置游戏启动路径', QMessageBox.Ok)
            return

        context = Context(ExpStrategy())
        context.execute_strategy()
        '''找到启动按钮'''
        # 获取项目根目录的绝对路径
        img = cv2.imread("./Resource/img/StartBtn.png")
        button_x, button_y = pyautogui.locateCenterOnScreen(img)
        print(button_x, button_y)
        # 移动鼠标到按钮位置并点击
        pyautogui.moveTo(button_x, button_y, duration=0.25)
        pyautogui.click()
        self.__init_window()
        print("运行游戏")

    def __init_window(self):
        """
        初始化界面
        :return:
        """
        # 先esc三次看是否回到最初界面，检测是否存在右侧状态栏
        # TODO
        pyautogui.press('esc')
        pyautogui.press('esc')
        pyautogui.press('esc')


def check_process_exists(process_name):
    for proc in psutil.process_iter(['name']):
        if proc.info['name'] == process_name:
            return True
    return False
