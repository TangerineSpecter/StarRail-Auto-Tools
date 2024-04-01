# -*- coding: utf-8 -*-

################################################################################
## Form generated from reading UI file 'StarRail.ui'
##
## Created by: Qt User 丢失的橘子 Interface Compiler version 6.6.2
##
## WARNING! All changes made in this file will be lost when recompiling UI file!
################################################################################

from PySide6.QtCore import (QCoreApplication, QMetaObject, QRect, QStringListModel, Qt)
from PySide6.QtGui import (QAction, QIcon, QShortcut, QKeySequence)
from PySide6.QtWidgets import (QGridLayout, QMenu, QFileDialog, QTableWidget, QListView, QGroupBox,
                               QMenuBar, QWidget, QMessageBox, QPushButton, QTextEdit, QLabel,
                               QTableWidgetItem, QInputDialog, QHeaderView, QAbstractItemView)

from Strategy.MainStrategy import Strategy
from Utils.CssUtils import (BtnCss)
from Utils.FileUtils import FileOper
import pyautogui
import os
import cv2
import subprocess
import time
import keyboard

# 系统信息
systemInfo = FileOper.load_file("system_info.json")
# 副本映射
dungeonMap = {item['parent_name']: item['children'] for item in FileOper.load_file("dungeon_list.json")}


class MainApp(object):
    def __init__(self, MainWindow, settings):
        if not MainWindow.objectName():
            MainWindow.setObjectName(u"MainWindow")
        MainWindow.setFixedSize(640, 480)
        MainWindow.setWindowIcon(QIcon("../Resource/img/icon.png"))
        self.settings = settings

        # 打开
        self.openAction = QAction(MainWindow)
        self.openAction.setObjectName(u"openAction")
        self.openAction.triggered.connect(self.open_file)

        # 关于
        self.aboutAction = QAction(MainWindow)
        self.aboutAction.setObjectName(u"aboutAction")
        self.aboutAction.triggered.connect(show_about_dialog)

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
        self.openFileBtn.clicked.connect(self.open_file)

        # 路径框
        self.gamePathText = QTextEdit(self.centralWidget)
        self.gamePathText.setObjectName(u"gamePathText")
        self.gamePathText.setGeometry(QRect(10, 10, 500, 40))
        self.gamePathText.setReadOnly(True)

        # 启动
        self.startGameBtn = QPushButton(self.centralWidget)
        self.startGameBtn.setObjectName(u"startGameBtn")
        self.startGameBtn.setGeometry(QRect(530, 80, 80, 40))
        self.startGameBtn.clicked.connect(lambda:
                                          Strategy.run_game(self.centralWidget, self.gamePathText.toPlainText()))

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
        self.listView.setEditTriggers(QAbstractItemView.NoEditTriggers)
        self.listView.setGeometry(QRect(15, 50, 141, 240))
        model = QStringListModel()
        # 列表数据
        model.setStringList(dungeonMap.keys())
        self.listView.setModel(model)

        # 执行表格
        self.tableWidget = QTableWidget(self.groupBox)
        self.tableWidget.setObjectName(u"tableView")
        self.tableWidget.setGeometry(QRect(180, 50, 300, 240))
        # self.tableWidget.verticalHeader().setVisible(False)
        # 禁止编辑单元格
        self.tableWidget.setEditTriggers(QTableWidget.NoEditTriggers)
        # 单元格自适应
        self.tableWidget.horizontalHeader().setSectionResizeMode(QHeaderView.ResizeToContents)
        # 最后一列铺满
        self.tableWidget.horizontalHeader().setSectionResizeMode(QHeaderView.Stretch)
        # 选中整行
        self.tableWidget.setSelectionBehavior(QTableWidget.SelectRows)
        self.tableWidget.setSelectionMode(QTableWidget.SingleSelection)

        # 数据
        # data = ['经验副本', '城郊雪原', '1', '晋级材料', '炼型者雷枝', '2']
        data = settings.value("table_data", None)
        headers = ['类型', '副本', '执行次数']
        self.tableWidget.setColumnCount(len(headers))
        self.tableWidget.setHorizontalHeaderLabels(headers)
        if data is not None:
            self.addTableItem(data, rowCount=(len(data) // len(headers)))

        # 添加内容按钮
        self.addItemBtn = QPushButton(self.groupBox)
        self.addItemBtn.setObjectName(u"addItemBtn")
        self.addItemBtn.setGeometry(QRect(180, 310, 80, 40))
        self.addItemBtn.clicked.connect(self.addListViewItem)
        # 设置内容按钮
        self.settingItemBtn = QPushButton(self.groupBox)
        self.settingItemBtn.setObjectName(u"settingItemBtn")
        self.settingItemBtn.setGeometry(QRect(290, 310, 80, 40))
        self.settingItemBtn.clicked.connect(self.settingTableItem)
        # 移除内容按钮
        self.removeItemBtn = QPushButton(self.groupBox)
        self.removeItemBtn.setObjectName(u"removeItemBtn")
        self.removeItemBtn.setGeometry(QRect(400, 310, 80, 40))
        self.removeItemBtn.clicked.connect(self.removeTableItem)

        # 说明部分
        self.selectListLabel = QLabel(self.groupBox)
        self.selectListLabel.setObjectName(u"selectListLabel")
        self.selectListLabel.setGeometry(QRect(20, 25, 58, 16))
        self.runListLabel = QLabel(self.groupBox)
        self.runListLabel.setObjectName(u"runListLabel")
        self.runListLabel.setGeometry(QRect(180, 25, 161, 16))

        self.retranslateUi(MainWindow)
        # 快捷键绑定
        # shortcut = QShortcut(QKeySequence("Ctrl+r"), self.centralWidget)
        # shortcut.activated.connect(lambda: Strategy.run_game(self.centralWidget, self.gamePathText.toPlainText()))
        keyboard.add_hotkey('ctrl+r', self.on_hotkey)

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
        self.startGameBtn.setText(QCoreApplication.translate("MainWindow", "启动游戏", None))
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
        BtnCss.blue(self.startGameBtn)

    def on_hotkey(self):
        Strategy.run_game(self.centralWidget, self.gamePathText.toPlainText())

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

    def addTableItem(self, data, columnCount=3, rowCount=1):
        """
        添加表格数据
        :param data: 数据
        :param columnCount: 列数
        :param rowCount: 行数
        """
        # 根据上一次行数进行计算
        start_row_count = self.tableWidget.rowCount()
        for rowIndex in range(rowCount):
            self.tableWidget.insertRow(self.tableWidget.rowCount())
            for columnIndex in range(columnCount):
                item = QTableWidgetItem(data[rowIndex * columnCount + columnIndex])
                # 设置数据居中
                item.setTextAlignment(Qt.AlignCenter)
                # 拼接到上一次行数后面
                self.tableWidget.setItem(start_row_count + rowIndex, columnIndex, item)
        self.refreshTableCache()

    def updateTableItem(self, data, columnCount=3, rowCount=1):
        """
        更新表格数据
        :param data: 数据
        :param columnCount: 列数
        :param rowCount: 行数
        """
        for columnIndex in range(columnCount):
            item = QTableWidgetItem(str(data[columnIndex]))
            # 设置数据居中
            item.setTextAlignment(Qt.AlignCenter)
            # 拼接到上一次行数后面
            self.tableWidget.setItem(rowCount, columnIndex, item)
        self.refreshTableCache()

    def addListViewItem(self):
        """
        添加list数据到table
        :return:
        """
        select_data_list = self.listView.selectedIndexes()
        if not select_data_list:
            QMessageBox.information(self.centralWidget, '提示', '未选中数据', QMessageBox.Ok)
            return

        select_data = select_data_list[0].data()
        # # 初始化表格数据
        self.addTableItem([select_data, "--", "1"])

    def settingTableItem(self):
        """
        修改表格数据
        :return:
        """
        select_item = self.tableWidget.selectedItems()
        if not select_item:
            QMessageBox.information(self.centralWidget, '提示', '未选中数据', QMessageBox.Ok)
            return

        self.show_input_dialog(select_item[0].row(), select_item[0].text())

    def removeTableItem(self):
        """
        移除表格数据
        :return:
        """
        select_item = self.tableWidget.selectedItems()
        if not select_item:
            QMessageBox.information(self.centralWidget, '提示', '未选中数据', QMessageBox.Ok)
            return

        # reply = QMessageBox.question(self.centralWidget, '确认', '确定要执行操作吗？', QMessageBox.Yes | QMessageBox.No,
        #                              QMessageBox.No)
        # if reply == QMessageBox.Yes:
        self.tableWidget.removeRow(select_item[0].row())
        self.refreshTableCache()

    def show_input_dialog(self, row_count, parent_name):
        items = dungeonMap.get(parent_name)
        item, ok = QInputDialog.getItem(self.centralWidget, "副本内容", "选择一个副本:", items, 0, False)

        if ok:
            number, ok = QInputDialog.getInt(self.centralWidget, "执行次数", "输入一个执行次数:", 1, 0, 99, 1)
            if ok:
                self.updateTableItem([parent_name, item, number], rowCount=row_count)

    def refreshTableCache(self):
        # 获取表格的行数和列数
        rows = self.tableWidget.rowCount()
        cols = self.tableWidget.columnCount()
        # 创建一个空列表来存储所有数据
        all_data = []

        # 遍历表格的每一行和每一列，获取单元格数据
        for row in range(rows):
            for col in range(cols):
                item = self.tableWidget.item(row, col)
                all_data.append(item.text())

        self.settings.setValue("table_data", all_data)
        pass


class AboutDialog(QMessageBox):
    def __init__(self, parent=None):
        super(AboutDialog, self).__init__(parent)
        self.setWindowTitle("关于")
        self.setText(f"版本号：{systemInfo['version']}\n作者：丢失的橘子\nBug反馈邮箱：993033472@qq.com")
        self.exec()


# 关于对话框
def show_about_dialog():
    AboutDialog()
