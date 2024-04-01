# Import Qt libraries
# Import PseudoSensor
# Import system tools and datetime
import sys

from PySide6.QtCore import (QSettings)
from PySide6.QtWidgets import *
from PySide6.QtGui import (QIcon)

# Import UI developed in Qt Creator
from MainlyGui.MainApp import MainApp  # 导入界面

# 创建 QSettings 对象，将 parent 参数设置为 None
settings = QSettings("MyCompany", "MyApp", parent=None)


# Create and start the Qt application
class MainWindow(QMainWindow):
    def __init__(self):
        super(MainWindow, self).__init__(None)

        # 设置界面为用户设计的界面
        self.ui = MainApp(self, settings)
        # self.ui.setupUi(self)

    def closeAndExit(self):
        settings.sync()
        sys.exit()


if __name__ == "__main__":
    app = QApplication()  # 初始化QApplication
    app.setWindowIcon(QIcon("./MainlyGui/icon.png"))

    # 初始化界面并显示界面
    window = MainWindow()
    window.show()

    sys.exit(app.exec())
