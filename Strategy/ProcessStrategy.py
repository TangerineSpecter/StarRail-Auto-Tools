import time

import pyautogui

import Config.CoordinateConfig as CoordinateConfig
import Config.DungeonConfig as DungeonConfig
import Config.LoggingConfig as Logging
import Utils.DataUtils as Data
import Utils.ImageUtils as ImageUtils
from Config.CoordinateConfig import BtnKey

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
    signal = None

    def doJob(self, row_data):
        main_name = row_data['main_name']
        dungeon_dict = DungeonConfig.dungeon_dict[main_name]
        row_data.update(dungeon_dict)

        strategy_class = globals()[dungeon_dict['strategy_class']]

        # 独立的策略调度
        context = Context(strategy_class(), self.signal)
        return context.execute_strategy(row_data)


class BaseStrategy(ProcessStrategy):
    """
    基础副本策略（经验、信用点）
    """
    signal = None

    def doJob(self, row_data):
        main_name = row_data['main_name']
        process_name = row_data['process_name']
        count = int(row_data['count'])
        simple_name = row_data['simple_name']
        Logging.info(f"开始执行 [{main_name}({process_name})] 自动化，总共执行次数{count}次")

        # 选择基础副本栏目
        pyautogui.moveTo(Data.getPosition(BtnKey.base_row), duration=Data.duration)
        pyautogui.click()

        # 选择地区
        if process_name == '雅利洛':
            pyautogui.moveTo(screen_width * 0.4125, screen_height * 0.3131, duration=Data.duration)
        elif process_name == '仙舟':
            pyautogui.moveTo(screen_width * 0.486, screen_height * 0.315, duration=Data.duration)
        elif process_name == '匹诺康尼':
            pyautogui.moveTo(screen_width * 0.553, screen_height * 0.306, duration=Data.duration)
        else:
            Logging.warn(f'未知副本，副本名称：{process_name}')
            return False
        pyautogui.click()

        # TODO 副本未开放检测

        # 传送
        pyautogui.moveTo(Data.getPosition(CoordinateConfig.get_base_run(simple_name)), duration=Data.duration)
        pyautogui.click()

        time.sleep(3)

        # 选择次数
        pyautogui.moveTo(Data.getPosition(BtnKey.action_count_btn), duration=Data.duration)
        for _ in range(count):
            pyautogui.click()
            time.sleep(0.2)

        # 统一执行挑战
        pyautogui.moveTo(Data.getPosition(BtnKey.action_btn), duration=Data.duration)
        pyautogui.click()

        if energy_lack():
            return

        # 等待2秒 界面弹出
        time.sleep(2)

        # 开始
        pyautogui.click()
        # 此逻辑可设置次数，则直接无重试退出
        BattleOver(signal=self.signal)


class AdvanceStrategy(ProcessStrategy):
    """
    图像识别副本策略（技能材料、晋级材料、遗器、周本）
    """
    signal = None

    def doJob(self, row_data):
        main_name = row_data['main_name']
        process_name = row_data['process_name']
        cv_img = row_data['children'][process_name]
        count = int(row_data['count'])
        simple_name = row_data['simple_name']
        Logging.info(f"开始执行 [{main_name}({process_name})] 自动化，总共执行次数{count}次")
        self.signal.emit(f"开始执行 [{main_name}({process_name})] 任务")

        if simple_name == "equip" or simple_name == "weekend":
            pyautogui.moveRel(0, 500, duration=Data.duration)
            pyautogui.dragRel(0, -500, duration=0.5, button='left')

        # 选择技能副本栏目
        pyautogui.moveTo(Data.getPosition(CoordinateConfig.get_dungeon_row(simple_name)), duration=Data.duration)
        pyautogui.click()

        # 平移到内容区域，鼠标不要遮挡识别图片
        pyautogui.moveRel(screen_width * 0.3, 0, duration=Data.duration)

        start_time = int(time.time())
        while True:
            try:
                Logging.info("开始识别副本中...")
                self.signal.emit("开始识别副本中...")
                # 最大识别30秒
                if int(time.time()) - start_time > 30:
                    Logging.warn(f"[{process_name}]执行超时")
                    return
                time.sleep(2)
                button_x, button_y = ImageUtils.cv(f"./Resource/img/{cv_img}.png")
                Logging.info("识别到副本开始挑战")
                self.signal.emit("识别到副本开始挑战")
                # 先将鼠标移动到图标位置
                pyautogui.moveTo(button_x, button_y, duration=Data.duration)
                # 相对图标进行平移点击传送
                pyautogui.moveRel(screen_width * 0.38, screen_height * 0.02, duration=Data.duration)
                pyautogui.click()
                # TODO 副本未开放检测
                break
            except Exception:
                Logging.info("未识别到副本，滚动界面继续识别...")
                self.signal.emit("未识别到副本，滚动界面继续识别...")
                pyautogui.dragRel(0, -500, duration=0.5, button='left')
                pyautogui.moveRel(0, 500, duration=0.5)

        time.sleep(3)

        # 统一执行挑战
        pyautogui.moveTo(Data.getPosition(BtnKey.action_btn), duration=Data.duration)
        pyautogui.click()

        # 点击重试后提示弹窗
        if energy_lack():
            self.signal.emit("体力不足，脚本终止")
            return

            # 等待2秒 界面弹出
        time.sleep(2)

        # 开始
        pyautogui.click()
        # 由于已战斗1次，则重试次数少1
        BattleOver(True, count - 1, self.signal)


class Context:
    def __init__(self, strategy, signal):
        """
        策略接口
        :param strategy: 调度策略
        :param
        """
        self.strategy = strategy
        strategy.signal = signal

    def execute_strategy(self, row_data):
        return self.strategy.doJob(row_data)


def BattleOver(retry=False, count=1, signal=None):
    """
    判断战斗是否结束
    :param retry 是否继续,True：继续；默认结束
    :param count 继续次数，默认1次
    :return: True:结束
    """
    while True:
        try:
            time.sleep(2)
            button_x, button_y = ImageUtils.cv("./Resource/img/BattleOver.png")
            print(button_x, button_y)
            # 重试，并且拥有重试次数
            if retry and count > 0:
                pyautogui.moveTo(Data.getPosition(BtnKey.dungeon_retry), duration=Data.duration)
                pyautogui.click()
                # 点击重试后提示弹窗
                if energy_lack():
                    break
                count = count - 1
                Logging.info(f"再次挑战副本，剩余次数：{count}")
                signal.emit(f"再次挑战副本，剩余次数：{count}")
                continue
            # 退出
            pyautogui.moveTo(Data.getPosition(BtnKey.dungeon_exit), duration=Data.duration)
            pyautogui.click()
            Logging.info("副本挑战结束，返回界面")
            signal.emit("副本挑战结束，返回界面")
            # 等待界面切换
            time.sleep(5)
            return True
        except pyautogui.ImageNotFoundException:
            Logging.info("战斗未结束，等待中...")
            signal.emit("战斗进行中...")


def energy_lack():
    """
    检测体力是否足够
    :return: True：识别到界面弹出体力不足提示
    """
    try:
        # 等1秒界面弹出
        time.sleep(1)
        ImageUtils.cv("./Resource/img/Money.png")
        Logging.warn("体力不足，终止")
        # 关闭界面
        pyautogui.moveTo(Data.getPosition(BtnKey.not_energy_cancel_btn), duration=Data.duration)
        pyautogui.click()
        pyautogui.moveTo(Data.getPosition(BtnKey.close_btn), duration=Data.duration)
        pyautogui.click()
        return True
    except pyautogui.ImageNotFoundException:
        # 未识别到弹窗，则无体力问题
        print("未识别到体力不足")
        return False
