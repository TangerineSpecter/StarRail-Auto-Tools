# -*- coding: utf-8 -*-

################################################################################
## Form generated from reading UI file 'testhaydty.ui'
##
## Created by: Qt User Interface Compiler version 6.6.2
##
## WARNING! All changes made in this file will be lost when recompiling UI file!
################################################################################

from PySide6.QtCore import (QCoreApplication, QMetaObject, QRect)
from PySide6.QtGui import (QAction, QIcon)
from PySide6.QtWidgets import (QGridLayout, QMenu, QFileDialog,
                               QMenuBar, QWidget, QMessageBox, QPushButton, QTextEdit)

version = '0.0.1'


class MainApp(object):
    def __init__(self, MainWindow, settings):
        if not MainWindow.objectName():
            MainWindow.setObjectName(u"MainWindow")
        MainWindow.resize(640, 320)
        MainWindow.setWindowIcon(QIcon("icon.png"))
        self.settings = settings

        # 打开
        self.openAction = QAction(MainWindow)
        self.openAction.setObjectName(u"openAction")

        # 关于
        self.aboutAction = QAction(MainWindow)
        self.aboutAction.setObjectName(u"aboutAction")
        self.centralwidget = QWidget(MainWindow)
        self.centralwidget.setObjectName(u"centralwidget")
        self.gridLayout = QGridLayout(self.centralwidget)
        self.gridLayout.setObjectName(u"gridLayout")
        MainWindow.setCentralWidget(self.centralwidget)
        self.menubar = QMenuBar(MainWindow)
        self.menubar.setObjectName(u"menubar")
        self.menubar.setGeometry(QRect(0, 0, 269, 37))
        self.menu = QMenu(self.menubar)
        self.menu.setObjectName(u"menu")
        MainWindow.setMenuBar(self.menubar)
        # 按钮
        self.openFileBtn = QPushButton(self.centralwidget)
        self.openFileBtn.setObjectName(u"openFileBtn")
        self.openFileBtn.setGeometry(QRect(530, 0, 80, 40))
        self.gamePathText = QTextEdit(self.centralwidget)
        self.gamePathText.setObjectName(u"gamePathText")
        self.gamePathText.setGeometry(QRect(10, 5, 500, 30))
        self.gamePathText.setReadOnly(True)
        # 下拉菜单
        self.menubar.addAction(self.menu.menuAction())
        self.menu.addAction(self.openAction)
        self.menu.addAction(self.aboutAction)

        # 打开文件
        self.openFileBtn.clicked.connect(self.open_file)
        self.openAction.triggered.connect(self.open_file)
        # 关于信息
        self.aboutAction.triggered.connect(show_about_dialog)

        self.retranslateUi(MainWindow)
        # 加载设置
        game_path = settings.value("game_path", None)
        if game_path is not None:
            self.gamePathText.setText(game_path)

        QMetaObject.connectSlotsByName(MainWindow)

    def retranslateUi(self, MainWindow):
        MainWindow.setWindowTitle(
            QCoreApplication.translate("MainWindow", f"星穹铁道自动工具 v{version}", None))
        self.openAction.setText(QCoreApplication.translate("MainWindow", "打开", None))
        self.aboutAction.setText(QCoreApplication.translate("MainWindow", "关于", None))
        self.menu.setTitle(QCoreApplication.translate("MainWindow", "文件", None))
        self.openFileBtn.setText(QCoreApplication.translate("MainWindow", "打开", None))
        self.gamePathText.setPlaceholderText(QCoreApplication.translate("MainWindow", "游戏启动路径", None))

    # 打开游戏文件
    def open_file(self):
        file_dialog = QFileDialog()
        file_dialog.setFileMode(QFileDialog.ExistingFile)
        file_dialog.setNameFilter("Executable Files (*.exe)")

        if file_dialog.exec():
            file_path = file_dialog.selectedFiles()[0]
            self.gamePathText.setText(file_path)
            # 保存设置
            self.settings.setValue("game_path", file_path)


class AboutDialog(QMessageBox):
    def __init__(self, parent=None):
        super(AboutDialog, self).__init__(parent)
        self.setWindowTitle("关于")
        self.setText(f"版本号：{version}\n作者：丢失的橘子\nBug反馈邮箱：993033472@qq.com")
        self.exec()


# 关于对话框
def show_about_dialog():
    AboutDialog()
