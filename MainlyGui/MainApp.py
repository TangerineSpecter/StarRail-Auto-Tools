# -*- coding: utf-8 -*-

################################################################################
## Form generated from reading UI file 'testhaydty.ui'
##
## Created by: Qt User Interface Compiler version 6.6.2
##
## WARNING! All changes made in this file will be lost when recompiling UI file!
################################################################################

from PySide6.QtCore import (QCoreApplication, QMetaObject, QRect, QStringListModel, Qt)
from PySide6.QtGui import (QAction, QIcon)
from PySide6.QtWidgets import (QGridLayout, QMenu, QFileDialog, QTableWidget, QListView, QGroupBox,
                               QMenuBar, QWidget, QMessageBox, QPushButton, QTextEdit, QLabel,
                               QTableWidgetItem, QHeaderView)
from Utils.FileUtils import FileOper
from Utils.CssUtils import (BtnCss)

systemInfo = FileOper.load_file("system_info.json")


class MainApp(object):
    def __init__(self, MainWindow, settings):
        if not MainWindow.objectName():
            MainWindow.setObjectName(u"MainWindow")
        MainWindow.setFixedSize(640, 480)
        MainWindow.setWindowIcon(QIcon("icon.png"))
        self.settings = settings

        # 打开
        self.openAction = QAction(MainWindow)
        self.openAction.setObjectName(u"openAction")

        # 关于
        self.aboutAction = QAction(MainWindow)
        self.aboutAction.setObjectName(u"aboutAction")
        self.centralWidget = QWidget(MainWindow)
        self.centralWidget.setObjectName(u"centralWidget")
        self.gridLayout = QGridLayout(self.centralWidget)
        self.gridLayout.setObjectName(u"gridLayout")
        MainWindow.setCentralWidget(self.centralWidget)
        self.menubar = QMenuBar(MainWindow)
        self.menubar.setObjectName(u"menubar")
        self.menubar.setGeometry(QRect(0, 0, 269, 37))
        self.menu = QMenu(self.menubar)
        self.menu.setObjectName(u"menu")
        MainWindow.setMenuBar(self.menubar)

        # 按钮
        self.openFileBtn = QPushButton(self.centralWidget)
        self.openFileBtn.setObjectName(u"openFileBtn")
        self.openFileBtn.setGeometry(QRect(530, 10, 80, 40))

        # 路径框
        self.gamePathText = QTextEdit(self.centralWidget)
        self.gamePathText.setObjectName(u"gamePathText")
        self.gamePathText.setGeometry(QRect(10, 10, 500, 40))
        self.gamePathText.setReadOnly(True)
        # 下拉菜单
        self.menubar.addAction(self.menu.menuAction())
        self.menu.addAction(self.openAction)
        self.menu.addAction(self.aboutAction)

        # 设置相关
        self.groupBox = QGroupBox(self.centralWidget)
        self.groupBox.setObjectName(u"groupBox")
        self.groupBox.setGeometry(QRect(20, 70, 500, 360))
        # 列表选项框
        self.listView = QListView(self.groupBox)
        self.listView.setObjectName(u"listView")
        self.listView.setEnabled(True)
        self.listView.setGeometry(QRect(15, 50, 141, 240))
        model = QStringListModel()
        # 测试数据
        model.setStringList(['经验副本', '晋级材料'])
        self.listView.setModel(model)

        # 执行表格
        self.tableWidget = QTableWidget(self.groupBox)
        self.tableWidget.setObjectName(u"tableView")
        self.tableWidget.setGeometry(QRect(180, 50, 300, 240))
        # self.tableWidget.verticalHeader().setVisible(False)
        # 禁止编辑单元格
        self.tableWidget.setEditTriggers(QTableWidget.NoEditTriggers)

        # 数据
        data = ['经验副本', '城郊雪原', '1', '晋级材料', '炼型者雷枝', '2']
        headers = ['类型', '副本', '执行次数']
        self.tableWidget.setColumnCount(3)
        self.tableWidget.setRowCount(2)
        self.tableWidget.setHorizontalHeaderLabels(headers)
        for i in range(len(data) // len(headers)):
            for j in range(len(headers)):
                item = QTableWidgetItem(data[i * len(headers) + j])
                # 设置数据居中
                item.setTextAlignment(Qt.AlignCenter)
                self.tableWidget.setItem(i, j, item)

        # 添加内容按钮
        self.addItemBtn = QPushButton(self.groupBox)
        self.addItemBtn.setObjectName(u"addItemBtn")
        self.addItemBtn.setGeometry(QRect(180, 310, 80, 40))
        # 设置内容按钮
        self.settingItemBtn = QPushButton(self.groupBox)
        self.settingItemBtn.setObjectName(u"settingItemBtn")
        self.settingItemBtn.setGeometry(QRect(290, 310, 80, 40))
        # 移除内容按钮
        self.removeItemBtn = QPushButton(self.groupBox)
        self.removeItemBtn.setObjectName(u"removeItemBtn")
        self.removeItemBtn.setGeometry(QRect(400, 310, 80, 40))
        # 说明部分
        self.selectListLabel = QLabel(self.groupBox)
        self.selectListLabel.setObjectName(u"selectListLabel")
        self.selectListLabel.setGeometry(QRect(20, 25, 58, 16))
        self.runListLabel = QLabel(self.groupBox)
        self.runListLabel.setObjectName(u"runListLabel")
        self.runListLabel.setGeometry(QRect(180, 25, 161, 16))

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
        # 面板元素布局
        MainWindow.setWindowTitle(
            QCoreApplication.translate("MainWindow", f"{systemInfo['title']} v{systemInfo['version']}", None))
        self.openAction.setText(QCoreApplication.translate("MainWindow", "打开", None))
        self.aboutAction.setText(QCoreApplication.translate("MainWindow", "关于", None))
        self.menu.setTitle(QCoreApplication.translate("MainWindow", "文件", None))
        self.openFileBtn.setText(QCoreApplication.translate("MainWindow", "打开", None))
        self.gamePathText.setPlaceholderText(QCoreApplication.translate("MainWindow", "游戏启动路径", None))
        self.groupBox.setTitle(QCoreApplication.translate("MainWindow", "设置", None))
        self.selectListLabel.setText(QCoreApplication.translate("MainWindow", "副本列表", None))
        self.runListLabel.setText(QCoreApplication.translate("MainWindow", "运行列表（按照顺序执行）", None))
        self.addItemBtn.setText(QCoreApplication.translate("MainWindow", "添加", None))
        self.settingItemBtn.setText(QCoreApplication.translate("MainWindow", "设置", None))
        self.removeItemBtn.setText(QCoreApplication.translate("MainWindow", "移除", None))
        # 样式设置
        BtnCss.blue(self.openFileBtn)
        BtnCss.blue(self.addItemBtn)
        BtnCss.orange(self.settingItemBtn)
        BtnCss.red(self.removeItemBtn)

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
        self.setText(f"版本号：{systemInfo['version']}\n作者：丢失的橘子\nBug反馈邮箱：993033472@qq.com")
        self.exec()


# 关于对话框
def show_about_dialog():
    AboutDialog()
