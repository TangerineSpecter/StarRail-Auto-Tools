import time

import cv2
import pyautogui

import Config.DungeonConfig as DungeonConfig
import Utils.DataUtils as Data

screen_width, screen_height = pyautogui.size()


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
        dungeon_dict = DungeonConfig.dungeon_dict[main_name]
        row_data.update(dungeon_dict)

        strategy_class = globals()[dungeon_dict['strategy_class']]

        # 独立的策略调度
        context = Context(strategy_class())
        return context.execute_strategy(row_data)


class BaseStrategy(ProcessStrategy):
    """
    基础副本策略（经验、信用点）
    """

    def doJob(self, row_data):
        process_name = row_data['process_name']
        count = int(row_data['count']) - 1
        simple_name = row_data['simple_name']

        # 选择基础副本栏目
        pyautogui.moveTo(Data.getPosition("base_row"), duration=Data.duration)
        pyautogui.click()

        # 选择地区
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
        pyautogui.moveTo(Data.getPosition(f"{simple_name}_run_btn"), duration=Data.duration)
        pyautogui.click()

        time.sleep(3)

        # 选择次数
        pyautogui.moveTo(Data.getPosition("action_count_btn"), duration=Data.duration)
        for _ in range(count):
            pyautogui.click()
            time.sleep(0.2)

        # 统一执行挑战
        pyautogui.moveTo(Data.getPosition("action_btn"), duration=Data.duration)
        pyautogui.click()

        # 等待2秒 界面弹出
        time.sleep(2)

        # 开始
        pyautogui.click()
        BattleOver()


class AdvanceStrategy(ProcessStrategy):
    """
    图像识别副本策略（技能材料、晋级材料、遗器、周本）
    """

    def doJob(self, row_data):
        process_name = row_data['process_name']
        cv_img = row_data['children'][process_name]
        count = int(row_data['count']) - 1
        simple_name = row_data['simple_name']

        # 选择技能副本栏目
        pyautogui.moveTo(Data.getPosition(f"{simple_name}_row"), duration=Data.duration)
        pyautogui.click()

        # 平移到内容区域，鼠标不要遮挡识别图片
        pyautogui.moveRel(screen_width * 0.2, 0, duration=Data.duration)

        # TODO 选择对应技能 图像识别
        start_time = int(time.time())
        while True:
            try:
                # 最大识别7秒
                if int(time.time()) - start_time > 7:
                    print("识别超时")
                    return
                time.sleep(1)
                img = cv2.imread(f"../Resource/img/{cv_img}.png")
                button_x, button_y = pyautogui.locateCenterOnScreen(img)
                # 先将鼠标移动到图标位置
                pyautogui.moveTo(button_x, button_y, duration=Data.duration)
                # 相对图标进行平移点击传送
                pyautogui.moveRel(1, button_y, duration=Data.duration)
                pyautogui.click()
                break
            except Exception:
                print("未识别到副本")
                pyautogui.scroll(200)

        time.sleep(3)

        # 统一执行挑战
        pyautogui.moveTo(Data.getPosition("action_btn"), duration=Data.duration)
        pyautogui.click()

        # 等待2秒 界面弹出
        time.sleep(2)

        # 开始
        pyautogui.click()

        BattleOver(True, count)


class Context:
    def __init__(self, strategy):
        """
        策略接口
        :param strategy: 调度策略
        :param
        """
        self.strategy = strategy
        self.test = 1

    def execute_strategy(self, row_data):
        return self.strategy.doJob(row_data)


def BattleOver(retry=False, count=1):
    """
    判断战斗是否结束
    :param retry 是否继续,True：继续；默认结束
    :param count 继续次数，默认1次
    :return: True:结束
    """
    while True:
        try:
            time.sleep(1)
            img = cv2.imread("./Resource/img/BattleOver.png")
            button_x, button_y = pyautogui.locateCenterOnScreen(img)
            print(button_x, button_y)
            # 重试，并且拥有重试次数
            if retry and count > 0:
                print("再次挑战")
                pyautogui.moveTo(Data.getPosition("dungeon_retry"), duration=Data.duration)
                count = count - 1
                continue
            # 退出
            pyautogui.moveTo(Data.getPosition("dungeon_exit"), duration=Data.duration)
            pyautogui.click()
            print("退出界面")
            # 等待界面切换
            time.sleep(5)
            return True
        except pyautogui.ImageNotFoundException:
            print("未挑战完毕")


if __name__ == '__main__':
    context = Context(DistributeStrategy())
    result = context.execute_strategy({'count': '1', 'main_name': '行迹材料', 'process_name': '雅利洛'})
