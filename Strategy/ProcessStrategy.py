import time

import pyautogui

import Config.DungeonConfig as DungeonConfig
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
                         DungeonConfig.dungeon_list}

        strategy_class = globals()[strategy_dict[main_name]]
        context = Context(strategy_class())
        return context.execute_strategy(row_data)


class ExpStrategy(ProcessStrategy):
    """
    角色经验副本策略
    """

    def doJob(self, row_data):
        """
        :param row_data:  行数据【主名称、子集名称、次数】
        """
        print("执行角色经验副本策略")
        screen_width, screen_height = pyautogui.size()
        process_name = row_data['process_name']
        count = int(row_data['count']) - 1

        # 选择刷金副本
        pyautogui.moveTo(screen_width * 0.286, screen_height * 0.451, duration=Data.duration)
        pyautogui.click()

        if process_name == '雅利洛':
            pyautogui.moveTo(screen_width * 0.4125, screen_height * 0.3131, duration=Data.duration)
        elif process_name == '仙舟':
            pyautogui.moveTo(screen_width * 0.486, screen_height * 0.315, duration=Data.duration)
        elif process_name == '匹诺康尼':
            pyautogui.moveTo(screen_width * 0.553, screen_height * 0.306, duration=Data.duration)
        else:
            print('未知副本')
            return False

        pyautogui.click()

        # 传送
        pyautogui.moveTo(screen_width * 0.793, screen_height * 0.459, duration=Data.duration)
        pyautogui.click()

        time.sleep(3)

        # 选择
        pyautogui.moveTo(screen_width * 0.95, screen_height * 0.83, duration=Data.duration)
        for _ in range(count):
            pyautogui.click()
            time.sleep(0.2)
        return True


class WeaponStrategy(ProcessStrategy):
    """
    武器经验策略
    """

    def doJob(self, row_data):
        """
        :param row_data:  行数据【主名称、子集名称、次数】
        :return True执行成功
        """
        print("执行武器经验副本策略")
        screen_width, screen_height = pyautogui.size()
        process_name = row_data['process_name']
        count = int(row_data['count']) - 1

        # 选择刷金副本
        pyautogui.moveTo(screen_width * 0.286, screen_height * 0.451, duration=Data.duration)
        pyautogui.click()

        if process_name == '雅利洛':
            pyautogui.moveTo(screen_width * 0.412, screen_height * 0.313, duration=Data.duration)
        elif process_name == '仙舟':
            pyautogui.moveTo(screen_width * 0.486, screen_height * 0.315, duration=Data.duration)
        elif process_name == '匹诺康尼':
            pyautogui.moveTo(screen_width * 0.553, screen_height * 0.306, duration=Data.duration)
        else:
            print('未知副本')
            return False

        pyautogui.click()

        # 传送
        pyautogui.moveTo(screen_width * 0.787, screen_height * 0.641, duration=Data.duration)
        pyautogui.click()

        time.sleep(3)

        # 选择
        pyautogui.moveTo(screen_width * 0.95, screen_height * 0.83, duration=Data.duration)
        for _ in range(count):
            pyautogui.click()
            time.sleep(0.2)
        return True


class MoneyStrategy(ProcessStrategy):
    """
    信用点副本策略
    """

    def doJob(self, row_data):
        """
        :param row_data:  行数据【主名称、子集名称、次数】
        :return True执行成功
        """
        print("执行武器经验副本策略")
        screen_width, screen_height = pyautogui.size()
        process_name = row_data['process_name']
        count = int(row_data['count']) - 1

        # 选择刷金副本
        pyautogui.moveTo(screen_width * 0.286, screen_height * 0.451, duration=Data.duration)
        pyautogui.click()

        if process_name == '雅利洛':
            pyautogui.moveTo(screen_width * 0.412, screen_height * 0.313, duration=Data.duration)
        elif process_name == '仙舟':
            pyautogui.moveTo(screen_width * 0.486, screen_height * 0.315, duration=Data.duration)
        elif process_name == '匹诺康尼':
            pyautogui.moveTo(screen_width * 0.553, screen_height * 0.306, duration=Data.duration)
        else:
            print('未知副本')
            return False

        pyautogui.click()

        # 传送
        pyautogui.moveTo(screen_width * 0.801, screen_height * 0.828, duration=Data.duration)
        pyautogui.click()

        time.sleep(3)

        # 选择
        pyautogui.moveTo(screen_width * 0.95, screen_height * 0.83, duration=Data.duration)
        for _ in range(count):
            pyautogui.click()
            time.sleep(0.2)
        return True


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
