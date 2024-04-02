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

    def doJob(self):
        print("执行经验副本策略")
        pass


class Context:
    def __init__(self, strategy):
        self.strategy = strategy

    def execute_strategy(self):
        return self.strategy.doJob()
