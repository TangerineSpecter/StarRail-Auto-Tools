import subprocess
import time

import psutil
import pyautogui
from PySide6.QtCore import QThread, Signal
from playsound import playsound

import Config.LoggingConfig as Logging
import Utils.Constant as Constant
import Utils.DataUtils as Data
import Utils.ImageUtils as ImageUtils
from Config.CoordinateConfig import BtnKey
from Strategy.ProcessStrategy import Context, DistributeStrategy


class Strategy(QThread):
    sinOut = Signal(str)
    statusOut = Signal(str)

    def __init__(self):
        super(Strategy, self).__init__()
        # 执行行数，每次主策略调度初始化
        self.row_index = 0
        self.tableData = []
        self.game_path = None

    def run(self):
        self.__init_data()
        self.run_game()

    def __init_data(self):
        """
        重载数据，避免线程初始化之后数据未刷新
        """
        # 重置
        self.tableData.clear()
        self.game_path = Data.settings.value("game_path", None)
        data = Data.settings.value("table_data", None)
        for i in range(0, len(data), 3):
            obj = {
                "main_name": data[i],
                "process_name": data[i + 1],
                "count": data[i + 2]
            }
            self.tableData.append(obj)

    def stop(self):
        Logging.warn("终止脚本运行")
        self.terminate()

    def run_game(self):
        try:
            Logging.info("开始检测游戏运行状态")
            if check_process_exists():
                Logging.info("游戏已运行，执行下一步")
                # playsound(Constant.Audio.running, block=False)
                self.__run_table_data()
            else:
                # self.__join_game()
                self.sinOut.emit("游戏未运行")
                self.statusOut.emit("游戏未运行")
                Logging.info("游戏未运行，终止")
                # playsound(Constant.Audio.not_running, block=False)
                return
        except Exception as e:
            Logging.error(f"脚本运行异常，异常信息：{e}")

        Logging.info("脚本运行结束")
        self.sinOut.emit("脚本运行结束")
        self.statusOut.emit("脚本运行结束")

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
        button_x, button_y = ImageUtils.cv("./Resource/img/StartBtn.png")
        print(button_x, button_y)
        # 移动鼠标到按钮位置并点击
        pyautogui.moveTo(button_x, button_y, duration=Data.duration)
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


def check_process_exists():
    """
    检测进程是否存在
    :return: True:存在
    """
    for proc in psutil.process_iter(['name']):
        if proc.info['name'] == Constant.app_name:
            return True
    return False
