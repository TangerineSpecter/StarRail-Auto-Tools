import time

import cv2
import psutil
import pyautogui
import subprocess
from PySide6.QtCore import QThread, Signal

import Config.LoggingConfig as Logging
import Utils.Constant as Constant
import Utils.DataUtils as Data
from Strategy.ProcessStrategy import Context, DistributeStrategy
from Utils.AudioUtils import AudioFactory
from Config.CoordinateConfig import BtnKey


class Strategy(QThread):
    sinOut = Signal(str)

    def __init__(self, game_path, tableData):
        super(Strategy, self).__init__()
        self.game_path = game_path
        # 执行行数，每次主策略调度初始化
        self.row_index = 0
        self.tableData = []
        for i in range(0, len(tableData), 3):
            obj = {
                "main_name": tableData[i],
                "process_name": tableData[i + 1],
                "count": tableData[i + 2]
            }
            self.tableData.append(obj)

    def run(self):
        self.run_game()

    def stop(self):
        Logging.warn("终止脚本运行")
        self.terminate()

    def run_game(self):
        try:
            Logging.info("开始检测游戏运行状态")
            if check_process_exists(Constant.app_name):
                Logging.info("游戏已运行，执行下一步")
                AudioFactory.play_audio(Constant.Audio.running)
                self.__run_table_data()
            else:
                # self.__join_game()
                AudioFactory.play_audio(Constant.Audio.not_running)
                self.sinOut.emit("游戏未运行")
                Logging.info("游戏未运行，终止")
        except Exception as e:
            Logging.error(f"脚本运行异常，异常信息：{e.__cause__}")

        Logging.info("脚本运行结束")

    def __join_game(self):
        """
        未运行，开始加入游戏策略
        """
        Logging.info("游戏未运行，开始尝试进入游戏")
        if len(self.game_path) <= 0:
            Logging.warn("游戏启动路径未设置，终止")
            self.sinOut.emit("未设置游戏启动路径")
            return

        process = subprocess.Popen(self.game_path, stderr=subprocess.PIPE)
        time.sleep(2)
        # TODO 等待程序执行完成 可能有问题
        process.communicate()

        '''找到启动按钮'''
        # 获取项目根目录的绝对路径
        img = cv2.imread("./Resource/img/StartBtn.png")
        button_x, button_y = pyautogui.locateCenterOnScreen(img)
        print(button_x, button_y)
        # 移动鼠标到按钮位置并点击
        pyautogui.moveTo(button_x, button_y, duration=0.25)
        pyautogui.click()
        # TODO 等待游戏开始画面点击 图像识别会准确一些
        time.sleep(10)
        pyautogui.click()
        self.__run_table_data()

    def __run_table_data(self):
        """
        执行表格数据
        """
        for index in range(len(self.tableData)):
            # 设置当前读取列索引
            Logging.info(f"开始执行第{index}行数据")
            self.row_index = index
            self.__init_window()

    def __init_window(self):
        """
        初始化界面
        :return:
        """
        # 点击三次右上角的x回到原始界面
        Logging.info("初始化游戏主窗口")
        pyautogui.moveTo(Data.getPosition(BtnKey.close_btn), duration=Data.duration)
        for _ in range(3):
            pyautogui.click()

        # 打开副本界面
        Logging.info("开始打开副本界面")
        pyautogui.keyDown('alt')
        pyautogui.moveTo(Data.getPosition(BtnKey.dungeon_main), duration=Data.duration)
        pyautogui.click()
        pyautogui.keyUp('alt')

        # 等待1秒 界面弹出
        time.sleep(1)

        # 选择副本
        pyautogui.moveTo(Data.getPosition(BtnKey.dungeon_tab), duration=Data.duration)
        pyautogui.click()

        # 策略分发
        context = Context(DistributeStrategy())
        result = context.execute_strategy(self.tableData[self.row_index])

        if not result:
            Logging.error("策略执行失败，跳过此次执行")
            return

    # Logging.info("主界面初始化结束")


def check_process_exists(process_name):
    for proc in psutil.process_iter(['name']):
        if proc.info['name'] == process_name:
            return True
    return False
