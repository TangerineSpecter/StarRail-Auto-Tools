# Import Qt libraries
# Import PseudoSensor
# Import system tools and datetime
import sys

from PySide6.QtCore import (QSettings)
from PySide6.QtGui import (QIcon)
from PySide6.QtWidgets import *

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
    app.setWindowIcon(QIcon("Resource/img/icon.png"))
    app.setStyleSheet(
        """
        /* 全局样式表，设置窗体背景为白色 */
        QMainWindow {
            background-color: #ffffff;
        }
        
        /* 全局样式表，应用于所有 QTextEdit */
        QTextEdit {
            background-color: #f5f7fa;
            border: 1px solid #c0ccda;
            padding: 5px;
            border-radius: 5px;
            font-size: 14px;
        }
        QTextEdit:focus {
            border: 1px solid #409EFF;
        }
        """
    )

    # 初始化界面并显示界面
    window = MainWindow()
    window.show()

    sys.exit(app.exec())
