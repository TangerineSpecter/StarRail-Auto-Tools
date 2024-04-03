import time

import pyautogui

from Utils.FileUtils import FileOper
import Utils.DataUtils as Data


class ProcessStrategy:
    """
    调度策略接口
    """

    def doJob(self, row_data):
        pass


class DistributeStrategy(ProcessStrategy):
    """
    分发策略
    """

    def doJob(self, row_data):
        main_name = row_data['main_name']

        strategy_dict = {item['parent_name']: item['strategy_class'] for item in
                         FileOper.load_config_file("dungeon_list.json")}

        strategy_class = globals()[strategy_dict[main_name]]
        context = Context(strategy_class())
        context.execute_strategy(row_data)
        print("策略调度完毕")
        pass


class ExpStrategy(ProcessStrategy):
    """
    经验副本策略
    """

    def doJob(self, row_data):
        """
        :param row_data:  行数据【主名称、子集名称、次数】
        """
        print("执行经验副本策略")
        screen_width, screen_height = pyautogui.size()

        # 选择刷金副本
        pyautogui.moveTo(screen_width * 0.286, screen_height * 0.451, duration=Data.duration)
        pyautogui.click()

        # 选择匹诺康尼
        pyautogui.moveTo(screen_width * 0.553, screen_height * 0.306, duration=Data.duration)
        pyautogui.click()

        # 传送
        pyautogui.moveTo(screen_width * 0.793, screen_height * 0.459, duration=Data.duration)
        pyautogui.click()

        time.sleep(3)

        # 选择
        pyautogui.moveTo(screen_width * 0.95, screen_height * 0.83, duration=Data.duration)
        for _ in range(int(row_data['count']) - 1):
            pyautogui.click()
            time.sleep(0.2)
        pass


class Context:
    def __init__(self, strategy):
        """
        策略接口
        :param strategy: 调度策略
        :param
        """
        self.strategy = strategy

    def execute_strategy(self, row_data):
        return self.strategy.doJob(row_data)
