from PySide6.QtCore import QThread, Signal, Slot
import time


class Worker(QThread):
    sinOut = Signal(str)

    def __init__(self):
        super(Worker, self).__init__()

    def run(self):
        while True:
            print("test")
            time.sleep(1)

        # self.sinOut.emit("任务消息")

    @Slot()
    def stop(self):
        self.terminate()
        # self.wait()
        self.finished.emit()
        print("中断完毕")
