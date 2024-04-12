import subprocess
import time

import psutil
import pyautogui
from PySide6.QtCore import QThread, Signal

import Config.LoggingConfig as Logging
import Utils.Constant as Constant
import Utils.DataUtils as Data
import Utils.ImageUtils as ImageUtils
from Utils.OcrUtils import ocr_img
from Config.CoordinateConfig import BtnKey, OcrKey
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
        self.statusOut.emit("手动停止脚本")
        self.terminate()

    def run_game(self):
        try:
            self.statusOut.emit("开始检测游戏运行状态")
            Logging.info("开始检测游戏运行状态")
            if check_process_exists():
                Logging.info("游戏已运行，执行下一步")
                # playsound(Constant.Audio.running, block=False)
                self.__run_table_data()
            else:
                # self.__join_game()
                self.sinOut.emit("游戏未运行")
                self.statusOut.emit("脚本运行结束")
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
        button_x, button_y = ImageUtils.cv(Data.getResourcePath("Resource/img/StartBtn.png"))
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

        # 执行自动派遣
        self.__run_dispatch()
        # 自动交每日任务
        self.__run_everyday_job()

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
        dis = DistributeStrategy()
        context = Context(dis, self.statusOut)
        result = context.execute_strategy(self.tableData[self.row_index])

        if not result:
            Logging.error("策略执行失败，跳过此次执行")
            return

    # Logging.info("主界面初始化结束")
    def __run_dispatch(self):
        """
        自动派遣
        """
        dispatch = Data.settings.value("dispatch")
        if dispatch:
            try:
                self.statusOut.emit("开始自动派遣")
                # TODO 识别执行
                pyautogui.moveTo(Data.getPosition(BtnKey.close_btn), duration=Data.duration)
                for _ in range(3):
                    pyautogui.click()

                # 等待两秒界面打开
                time.sleep(1)

                pyautogui.press("esc")

                # 等待两秒界面打开
                time.sleep(2)

                # 识别对应坐标，点击一键派遣
                pyautogui.moveTo(Data.getPosition(BtnKey.dispatch_main), duration=Data.duration)
                pyautogui.click()

                # 等待两秒界面打开
                time.sleep(2)

                # 判断是否可派遣
                ocr_info, img_x, img_y = ImageUtils.cut_img_screenshot("all_dispatch")
                ocr_text = ocr_img(ocr_info)
                print(ocr_text)
                if ocr_text == "一键领取":
                    self.statusOut.emit("委托派遣完毕")
                    Logging.info("委托派遣完毕")
                    print(img_x, img_y)
                    pyautogui.moveTo(img_x, img_y, duration=Data.duration)
                    pyautogui.click()
                else:
                    self.statusOut.emit("不可派遣，步骤结束")
                    Logging.info("不可派遣，步骤结束")
                    time.sleep(1)
            except Exception as e:
                self.statusOut.emit("每日任务缴纳异常，终止")
                time.sleep(1)

    def __run_everyday_job(self):
        """
        自动交每日任务
        """
        # TODO 打开每日任务界面
        everyday_job = Data.settings.value("everyday_job")
        if everyday_job:
            try:
                self.statusOut.emit("开始交纳每日任务")

                pyautogui.moveTo(Data.getPosition(BtnKey.close_btn), duration=Data.duration)
                for _ in range(3):
                    pyautogui.click()

                # 打开副本界面
                Logging.info("开始打开副本界面")
                pyautogui.keyDown('alt')
                pyautogui.moveTo(Data.getPosition(BtnKey.dungeon_main), duration=Data.duration)
                pyautogui.click()
                pyautogui.keyUp('alt')

                time.sleep(2)

                # 打开每日任务界面
                pyautogui.moveTo(Data.getPosition(BtnKey.job_tab), duration=Data.duration)
                pyautogui.click()

                time.sleep(2)

                every_job_point_img, _, _ = ImageUtils.cut_img_screenshot(OcrKey.every_job_point)
                ocr_text = ocr_img(every_job_point_img)
                print(ocr_text)
                job_point = int(ocr_img(every_job_point_img))
                # 每日任务点数，未到500则可继续领取
                if job_point < 500:
                    remaining_count = int((500 - job_point) / 100)
                    print(f"次数{remaining_count}")
                    self.statusOut.emit(f"开始缴纳每日任务，剩余缴纳次数：{remaining_count}")
                    for count in range(remaining_count):
                        time.sleep(1)
                        # 识别任务按钮
                        print("识别")
                        every_job_img, x, y = ImageUtils.cut_img_screenshot(OcrKey.every_job)
                        ocr_text = ocr_img(every_job_img)
                        if ocr_text != "领取":
                            print("无法领取")
                            break
                        self.statusOut.emit(f"任务领取中{count + 1}")
                        pyautogui.moveTo(x, y, duration=Data.duration)
                        pyautogui.click()
                        # 领取完之后，挪动鼠标避免遮挡
                        pyautogui.moveRel(100, 0, duration=Data.duration)
                self.statusOut.emit("无可缴纳任务终止")
                pyautogui.moveTo(Data.getPosition(BtnKey.job_complete_btn5), duration=Data.duration)
                pyautogui.click()
                # 等待一会退出界面
                time.sleep(0.5)
                pyautogui.click()
                pyautogui.press("esc")
            except Exception as e:
                self.statusOut.emit("每日任务缴纳异常，终止")
            time.sleep(1)


def check_process_exists():
    """
    检测进程是否存在
    :return: True:存在
    """
    for proc in psutil.process_iter(['name']):
        if proc.info['name'] == Constant.app_name:
            return True
    return False
