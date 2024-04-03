import time

import cv2
import psutil
import pyautogui

import Utils.Constant as Constant
import Utils.DataUtils as Data
from Strategy.ProcessStrategy import Context, DistributeStrategy


class Strategy:

    def __init__(self, MainWindow):
        self.QWidget = MainWindow.centralWidget
        self.game_path = MainWindow.gamePathText.toPlainText()
        # 执行行数，每次主策略调度初始化
        self.row_index = 0
        self.tableData = []
        for i in range(0, len(MainWindow.tableData), 3):
            obj = {
                "main_name": MainWindow.tableData[i],
                "process_name": MainWindow.tableData[i + 1],
                "count": MainWindow.tableData[i + 2]
            }
            self.tableData.append(obj)

    def run_game(self):
        # process = subprocess.Popen(game_path, stderr=subprocess.PIPE)
        # time.sleep(2)
        # 等待程序执行完成
        # process.communicate()

        try:
            print("执行主策略：开始比对")
            if check_process_exists(Constant.app_name):
                print("已运行")
                # AudioFactory.play_audio(Constant.Audio.running)
                self.__run_table_data()
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
            # QMessageBox.information(self.QWidget, '提示', '未设置游戏启动路径', QMessageBox.Ok)
            return

        # context = Context(ExpStrategy())
        # context.execute_strategy()
        '''找到启动按钮'''
        # 获取项目根目录的绝对路径
        img = cv2.imread("./Resource/img/StartBtn.png")
        button_x, button_y = pyautogui.locateCenterOnScreen(img)
        print(button_x, button_y)
        # 移动鼠标到按钮位置并点击
        pyautogui.moveTo(button_x, button_y, duration=0.25)
        pyautogui.click()
        self.__run_table_data()
        print("运行游戏")

    def __run_table_data(self):
        """
        执行表格数据
        """
        for index in range(len(self.tableData)):
            # 设置当前读取列索引
            print(f"开始执行第{index}行逻辑")
            self.row_index = index
            self.__init_window()

    def __init_window(self):
        """
        初始化界面
        :return:
        """
        # 点击三次右上角的x回到原始界面
        print("初始化窗口")
        pyautogui.moveTo(Data.getPosition("close_btn"), duration=Data.duration)
        for _ in range(3):
            pyautogui.click()

        # 打开副本界面
        pyautogui.keyDown('alt')
        pyautogui.moveTo(Data.getPosition("dungeon_open"), duration=Data.duration)
        pyautogui.click()
        pyautogui.keyUp('alt')

        # 等待1秒 界面弹出
        time.sleep(1)

        # 选择副本
        pyautogui.moveTo(Data.getPosition("dungeon_main"), duration=Data.duration)
        pyautogui.click()

        # 策略分发
        context = Context(DistributeStrategy())
        result = context.execute_strategy(self.tableData[self.row_index])

        if not result:
            print("策略执行失败，跳过此次执行")
            return

        # 统一执行挑战
        pyautogui.moveTo(Data.getPosition("action_btn"), duration=Data.duration)
        pyautogui.click()

        # 等待2秒 界面弹出
        time.sleep(2)

        # 开始
        pyautogui.click()

        # 判断是否挑战成功
        while True:
            try:
                time.sleep(1)
                img = cv2.imread("./Resource/img/BattleOver.png")
                button_x, button_y = pyautogui.locateCenterOnScreen(img)
                print(button_x, button_y)
                pyautogui.moveTo(Data.getPosition("dungeon_exit"), duration=Data.duration)
                pyautogui.click()
                # 等待界面切换
                time.sleep(5)
                break
            except pyautogui.ImageNotFoundException:
                print("未挑战完毕")

    print("初始化结束")


def check_process_exists(process_name):
    for proc in psutil.process_iter(['name']):
        if proc.info['name'] == process_name:
            return True
    return False
