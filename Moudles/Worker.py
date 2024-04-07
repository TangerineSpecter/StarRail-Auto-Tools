from PySide6.QtCore import QThread, Signal, Slot
import time


class Worker(QThread):
    sinOut = Signal(str)

    def __init__(self):
        super(Worker, self).__init__()

    def run(self):
        self.sinOut.emit("脚本执行启动")
        while True:
            print("test")
            time.sleep(1)

    @Slot()
    def stop(self):
        self.terminate()
        # self.wait()
        self.finished.emit()
        print("中断完毕")
        self.sinOut.emit("脚本执行中断")
