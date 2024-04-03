import time

import pyautogui

from Utils.FileUtils import FileOper


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
        context = Context(strategy_class(), None)
        context.execute_strategy()
        print("策略调度完毕")
        pass


class ExpStrategy(ProcessStrategy):
    """
    经验副本策略
    """

    def doJob(self, row_data):
        print("执行经验副本策略")
        screen_width, screen_height = pyautogui.size()

        # 选择刷金副本
        pyautogui.moveTo(screen_width * 0.23, screen_height * 0.43, duration=0.25)
        pyautogui.click()

        # 选择匹诺康尼
        pyautogui.moveTo(screen_width * 0.55, screen_height * 0.3, duration=0.25)
        pyautogui.click()

        # 传送
        pyautogui.moveTo(screen_width * 0.8, screen_height * 0.48, duration=0.25)
        pyautogui.click()

        time.sleep(3)

        # 选择
        pyautogui.moveTo(screen_width * 0.95, screen_height * 0.83, duration=0.25)
        for _ in range(row_data['count']):
            pyautogui.click()
            time.sleep(0.2)
        pass


class Context:
    def __init__(self, strategy, row_data):
        """
        策略接口
        :param strategy: 调度策略
        :param row_data: 行数据【主名称、子集名称、次数】
        """
        self.strategy = strategy
        self.row_data = row_data

    def execute_strategy(self):
        return self.strategy.doJob(self.row_data)
