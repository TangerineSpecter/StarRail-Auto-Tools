import pyautogui
import time


class ProcessStrategy:
    """
    调度策略接口
    """

    def doJob(self):
        pass


class ExpStrategy(ProcessStrategy):
    """
    经验副本策略
    """
    screen_width, screen_height = pyautogui.size()
    # 打开副本界面
    pyautogui.keyDown('alt')
    pyautogui.moveTo(screen_width * 0.83, screen_height * 0.035, duration=0.25)
    pyautogui.click()
    pyautogui.keyUp('alt')

    # 选择刷金副本
    pyautogui.moveTo(screen_width * 0.33, screen_height * 0.2, duration=0.25)
    pyautogui.click()

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

    # 选择6
    pyautogui.moveTo(screen_width * 0.95, screen_height * 0.83, duration=0.25)
    for _ in range(6):
        pyautogui.click()
        time.sleep(0.2)

    # 挑战
    pyautogui.moveTo(screen_width * 0.85, screen_height * 0.9, duration=0.25)
    pyautogui.click()

    # 开始
    # pyautogui.click()

    def doJob(self):
        print("执行经验副本策略")
        pass


class Context:
    def __init__(self, strategy):
        self.strategy = strategy

    def execute_strategy(self):
        return self.strategy.doJob()
