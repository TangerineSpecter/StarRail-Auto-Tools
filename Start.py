# Import Qt libraries
# Import PseudoSensor
# Import system tools and datetime
import sys

import pyautogui
from PySide6.QtCore import Qt, Signal, QRect
from PySide6.QtGui import (QIcon, QFont)
from PySide6.QtWidgets import *

import Config.LoggingConfig as Logging
import Utils.DataUtils as Data
# Import UI developed in Qt Creator
from MainlyGui.MainApp import MainApp  # 导入界面


# Create and start the Qt application
class MainWindow(QMainWindow):
    changeOut = Signal(str)

    def __init__(self):
        super(MainWindow, self).__init__(None)

        # 设置界面为用户设计的界面
        self.main_window = MainApp(self)
        # self.ui.setupUi(self)

    def closeAndExit(self):
        Data.settings.sync()
        sys.exit()

    def closeEvent(self, event):
        Logging.info("关闭应用程序")
        app.quit()


class StatusLabel(QLabel):

    def __init__(self):
        super(StatusLabel, self).__init__(None)
        self.setStyleSheet("color: red; background-color: white; padding: 5px;")
        self.setWindowFlags(Qt.WindowStaysOnTopHint | Qt.FramelessWindowHint)
        self.setAttribute(Qt.WA_TranslucentBackground)
        self.setGeometry(QRect(0, 0, 800, 80))
        self.setWindowFlag(Qt.Tool)
        font = QFont()
        font.setPointSize(18)
        self.setFont(font)
        self.setText("待机中")
        self.setAlignment(Qt.AlignTop | Qt.AlignLeft)
        self.show()

    def update_text(self, text):
        self.setText(text)


if __name__ == "__main__":
    # 初始化QApplication
    app = QApplication()
    app.setWindowIcon(QIcon(Data.getResourcePath("Resource/img/icon.png")))
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

    label_window = StatusLabel()

    # 初始化界面并显示界面
    window = MainWindow()
    window.changeOut.connect(label_window.update_text)
    window.show()

    # 获取屏幕的宽度和高度
    screen_width, screen_height = pyautogui.size()

    # 设置label的位置为屏幕的右上角
    label_window.move((screen_width - label_window.width()) / 2, 0)
    sys.exit(app.exec())
