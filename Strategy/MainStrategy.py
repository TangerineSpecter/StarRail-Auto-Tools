import cv2
import pyautogui
from PySide6.QtCore import QThread
from PySide6.QtWidgets import (QMessageBox)
from playsound import playsound


class Strategy:

    @staticmethod
    def run_game(QWidget, game_path):
        if len(game_path) <= 0:
            QMessageBox.information(QWidget, '提示', '未设置游戏启动路径', QMessageBox.Ok)
            return

        # process = subprocess.Popen(game_path, stderr=subprocess.PIPE)
        # time.sleep(2)
        # 等待程序执行完成
        # process.communicate()

        try:
            print("开始比对")
            # 获取项目根目录的绝对路径
            img = cv2.imread("./Resource/img/StartBtn.png")
            button_x, button_y = pyautogui.locateCenterOnScreen(img)
            print(button_x, button_y)
            # 移动鼠标到按钮位置并点击
            pyautogui.moveTo(button_x, button_y, duration=0.25)
            pyautogui.click()
            print("运行脚本")
            # file_path = "./Resource/audio/running.mp3"
            # StartAudio(file_path).start()
        except Exception as e:
            print("未识别到图像")
            # file_path = "./Resource/audio/not_running.mp3"
            # StartAudio(file_path).start()
            # QMessageBox.information(QWidget, '提示', '未识别到游戏', QMessageBox.Ok)
        print("结束")


class StartAudio(QThread):
    def __init__(self, file_path):
        super().__init__()
        self.file_path = file_path

    def run(self):
        playsound(self.file_path)
        self.finished.emit()
