# -*- coding: utf-8 -*-

################################################################################
## Form generated from reading UI file 'StarRail.ui'
##
## Created by: Qt User 丢失的橘子 Interface Compiler version 6.6.2
##
## WARNING! All changes made in this file will be lost when recompiling UI file!
################################################################################

import platform

from PySide6.QtCore import (QCoreApplication, QMetaObject, QRect, QStringListModel, Qt)
from PySide6.QtGui import (QAction, QIcon)
from PySide6.QtWidgets import (QGridLayout, QMenu, QFileDialog, QTableWidget, QListView, QGroupBox,
                               QMenuBar, QWidget, QMessageBox, QPushButton, QTextEdit, QLabel, QVBoxLayout,
                               QTableWidgetItem, QInputDialog, QHeaderView, QAbstractItemView, QStatusBar, QDialog)

if platform.system() == 'Windows':
    from Moudles.KeyboardModule import KeyboardModule
from Strategy.MainStrategy import Strategy
from Utils.CssUtils import (BtnCss)
from Utils.FileUtils import FileOper
import Config.DungeonConfig as DungeonConfig
import Config.SystemInfo as SystemInfo
import Config.LoggingConfig as Logging
import Utils.DataUtils as Data
import Utils.Constant as Constant

# 系统信息
systemInfo = SystemInfo.base_info


class MainApp(object):
    def __init__(self, MainWindow):
        Logging.info("应用程序初始化")
        # 初始化窗体基本信息
        MainWindow.setObjectName(u"MainWindow")
        MainWindow.setFixedSize(640, 480)
        MainWindow.setWindowIcon(QIcon(Constant.icon))
        MainWindow.setWindowTitle(
            QCoreApplication.translate("MainWindow", f"{systemInfo['title']} v{systemInfo['version']}", None))

        # 初始化布局
        self.__initLayout(MainWindow)

        # 初始化数据
        self.__initData()

        # 初始化菜单栏
        self.__initMenubar(MainWindow)

        # 初始化按钮部分
        self.__initButton()

        # 初始化说明部分
        self.__initLabel()

        # 初始化样式
        self.__initStyle()

        # 快捷键绑定
        if platform.system() == 'Windows':
            KeyboardModule(self.worker).bind_start_game()
            KeyboardModule(self.worker).bind_position()

        QMetaObject.connectSlotsByName(MainWindow)

    def __initButton(self):
        """
        初始化按钮
        """
        # 打开
        self.openFileBtn = QPushButton(self.centralWidget)
        self.openFileBtn.setObjectName(u"openFileBtn")
        self.openFileBtn.setGeometry(QRect(530, 10, 80, 40))
        self.openFileBtn.clicked.connect(self.open_file)
        self.openFileBtn.setText(QCoreApplication.translate("MainWindow", "打开", None))

        # 启动
        self.startGameBtn = QPushButton(self.centralWidget)
        self.startGameBtn.setObjectName(u"startGameBtn")
        self.startGameBtn.setGeometry(QRect(530, 80, 80, 40))
        self.startGameBtn.clicked.connect(
            lambda: self.worker.start())
        self.startGameBtn.setText(QCoreApplication.translate("MainWindow", "启动游戏", None))

        # 日志
        self.logBtn = QPushButton(self.centralWidget)
        self.logBtn.setObjectName(u"logBtn")
        self.logBtn.setGeometry(QRect(530, 150, 80, 40))
        self.logBtn.clicked.connect(show_log)
        self.logBtn.setText(QCoreApplication.translate("MainWindow", "日志", None))

        # 添加内容按钮
        self.addItemBtn = QPushButton(self.groupBox)
        self.addItemBtn.setObjectName(u"addItemBtn")
        self.addItemBtn.setGeometry(QRect(180, 310, 80, 40))
        self.addItemBtn.clicked.connect(self.addListViewItem)
        self.addItemBtn.setText(QCoreApplication.translate("MainWindow", "添加", None))

        # 设置内容按钮
        self.settingItemBtn = QPushButton(self.groupBox)
        self.settingItemBtn.setObjectName(u"settingItemBtn")
        self.settingItemBtn.setGeometry(QRect(290, 310, 80, 40))
        self.settingItemBtn.clicked.connect(self.settingTableItem)
        self.settingItemBtn.setText(QCoreApplication.translate("MainWindow", "设置", None))

        # 移除内容按钮
        self.removeItemBtn = QPushButton(self.groupBox)
        self.removeItemBtn.setObjectName(u"removeItemBtn")
        self.removeItemBtn.setGeometry(QRect(400, 310, 80, 40))
        self.removeItemBtn.clicked.connect(self.removeTableItem)
        self.removeItemBtn.setText(QCoreApplication.translate("MainWindow", "移除", None))
        pass

    def __initLabel(self):
        """
        初始化说明标签
        """
        # 列表选择
        self.selectListLabel = QLabel(self.groupBox)
        self.selectListLabel.setObjectName(u"selectListLabel")
        self.selectListLabel.setGeometry(QRect(20, 25, 58, 16))
        self.selectListLabel.setText(QCoreApplication.translate("MainWindow", "副本列表", None))

        # 运行表格
        self.runListLabel = QLabel(self.groupBox)
        self.runListLabel.setObjectName(u"runListLabel")
        self.runListLabel.setGeometry(QRect(180, 25, 161, 16))
        self.runListLabel.setText(QCoreApplication.translate("MainWindow", "运行列表（按照顺序执行）", None))

        # 启动快捷键
        self.runKeyboardLabel = QLabel(self.groupBox)
        self.runKeyboardLabel.setObjectName(u"runKeyboardLabel")
        self.runKeyboardLabel.setGeometry(QRect(20, 310, 158, 16))
        self.runKeyboardLabel.setText(
            QCoreApplication.translate("MainWindow", f"启动快捷键：{Constant.start_keyboard}", None))

        # 停止快捷键
        self.stopKeyboardLabel = QLabel(self.groupBox)
        self.stopKeyboardLabel.setObjectName(u"stopKeyboardLabel")
        self.stopKeyboardLabel.setGeometry(QRect(20, 330, 158, 16))
        self.stopKeyboardLabel.setText(
            QCoreApplication.translate("MainWindow", f"停止快捷键：{Constant.stop_keyboard}", None))
        pass

    def __initLayout(self, MainWindow):
        """
        初始化布局
        """
        self.centralWidget = QWidget(MainWindow)
        self.centralWidget.setObjectName(u"centralWidget")
        self.gridLayout = QGridLayout(self.centralWidget)
        self.gridLayout.setObjectName(u"gridLayout")
        MainWindow.setCentralWidget(self.centralWidget)

        # 路径框
        self.gamePathText = QTextEdit(self.centralWidget)
        self.gamePathText.setObjectName(u"gamePathText")
        self.gamePathText.setGeometry(QRect(10, 10, 500, 40))
        self.gamePathText.setReadOnly(True)
        self.gamePathText.setPlaceholderText(QCoreApplication.translate("MainWindow", "游戏启动路径", None))

        # 设置部分窗体
        self.groupBox = QGroupBox(self.centralWidget)
        self.groupBox.setObjectName(u"groupBox")
        self.groupBox.setGeometry(QRect(20, 70, 500, 360))
        self.groupBox.setTitle(QCoreApplication.translate("MainWindow", "设置", None))

        # 状态栏
        self.statusBar = QStatusBar(self.centralWidget)
        self.statusBar.setObjectName("statusBar")
        MainWindow.setStatusBar(self.statusBar)
        self.runStatusLabel = QLabel()
        self.setStatusText("待机")
        self.statusBar.addPermanentWidget(self.runStatusLabel)

    def __initMenubar(self, MainWindow):
        """
        初始化菜单栏
        """
        # 打开
        self.openAction = QAction(MainWindow)
        self.openAction.setObjectName(u"openAction")
        self.openAction.triggered.connect(self.open_file)
        self.openAction.setText(QCoreApplication.translate("MainWindow", "打开", None))

        # 关于
        self.aboutAction = QAction(MainWindow)
        self.aboutAction.setObjectName(u"aboutAction")
        self.aboutAction.triggered.connect(show_about_dialog)
        self.aboutAction.setText(QCoreApplication.translate("MainWindow", "关于", None))

        # 日志
        self.logAction = QAction(MainWindow)
        self.logAction.setObjectName(u"logAction")
        self.logAction.triggered.connect(show_log)
        self.logAction.setText(QCoreApplication.translate("MainWindow", "日志", None))

        # 下拉菜单
        self.menubar = QMenuBar(MainWindow)
        self.menubar.setObjectName(u"menubar")
        self.menubar.setGeometry(QRect(0, 0, 269, 37))
        # 菜单栏 1
        self.menu = QMenu(self.menubar)
        self.menu.setObjectName(u"menu")
        MainWindow.setMenuBar(self.menubar)

        self.menubar.addAction(self.menu.menuAction())
        self.menu.addAction(self.openAction)
        self.menu.addAction(self.logAction)
        self.menu.addAction(self.aboutAction)
        self.menu.setTitle(QCoreApplication.translate("MainWindow", "文件", None))

    def __initStyle(self):
        """
        样式设置
        """
        BtnCss.blue(self.openFileBtn)
        BtnCss.blue(self.addItemBtn)
        BtnCss.orange(self.settingItemBtn)
        BtnCss.red(self.removeItemBtn)
        BtnCss.blue(self.startGameBtn)
        BtnCss.purple(self.logBtn)

    # 打开游戏文件
    def open_file(self):
        file_dialog = QFileDialog()
        file_dialog.setFileMode(QFileDialog.ExistingFile)
        file_dialog.setNameFilter("Executable Files (*.exe)")

        if file_dialog.exec():
            file_path = file_dialog.selectedFiles()[0]
            self.gamePathText.setText(file_path)
            # 保存设置
            Data.settings.setValue("game_path", file_path)

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
        self.__refreshTableCache()

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
        self.__refreshTableCache()

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
        self.__refreshTableCache()

    def show_input_dialog(self, row_count, parent_name):
        max_count = DungeonConfig.dungeon_dict[parent_name]['max_count']
        items = DungeonConfig.dungeon_dict[parent_name]['children']
        item, ok = QInputDialog.getItem(self.centralWidget, "副本内容", "选择一个副本:", items, 0, False)

        if ok:
            number, ok = QInputDialog.getInt(self.centralWidget, "执行次数", "输入一个执行次数:",
                                             1, 0, int(max_count), 1)
            if ok:
                self.updateTableItem([parent_name, item, number], rowCount=row_count)

    def __refreshTableCache(self):
        """
        刷新表格缓存数据
        """
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

        Data.settings.setValue("table_data", all_data)
        self.tableData = all_data
        pass

    def setStatusText(self, text):
        self.runStatusLabel.setText(f"当前状态：{text}")

    def showMsg(self, text):
        QMessageBox.information(self.centralWidget, '提示', text, QMessageBox.Ok)
        return

    def __initData(self):
        """
        初始化面板数据部分
        """
        # 列表选项框
        self.listView = QListView(self.groupBox)
        self.listView.setObjectName(u"listView")
        self.listView.setEditTriggers(QAbstractItemView.NoEditTriggers)
        self.listView.setGeometry(QRect(15, 50, 141, 240))
        model = QStringListModel()
        # 列表数据
        model.setStringList(DungeonConfig.dungeon_dict.keys())
        self.listView.setModel(model)

        # 执行表格
        self.tableWidget = QTableWidget(self.groupBox)
        self.tableWidget.setObjectName(u"tableView")
        self.tableWidget.setGeometry(QRect(180, 50, 300, 240))
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
        self.tableData = Data.settings.value("table_data", None)
        headers = ['类型', '副本', '执行次数']
        self.tableWidget.setColumnCount(len(headers))
        self.tableWidget.setHorizontalHeaderLabels(headers)
        if self.tableData is not None:
            self.addTableItem(self.tableData, rowCount=(len(self.tableData) // len(headers)))

        # 加载设置
        game_path = Data.settings.value("game_path", None)
        if game_path is not None:
            self.gamePathText.setText(game_path)

        # 线程创建
        self.worker = Strategy(game_path, self.tableData)
        self.worker.sinOut.connect(self.showMsg)


class AboutDialog(QMessageBox):
    def __init__(self, parent=None):
        super(AboutDialog, self).__init__(parent)
        self.setWindowTitle("关于")
        self.setText(f"版本号：{systemInfo['version']}\n"
                     f"作者：{systemInfo['author']}\n"
                     f"Bug反馈邮箱：{systemInfo['email']}")
        self.exec()


# 关于对话框
def show_about_dialog():
    AboutDialog()


def show_log():
    """
    打开日志
    """
    sub_window = SubWindow()
    # 设置为模态对话框
    sub_window.setModal(True)
    sub_window.exec()


class SubWindow(QDialog):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("查看日志")

        layout = QVBoxLayout()
        # 86 177 110
        self.textEdit = QTextEdit()
        self.textEdit.setStyleSheet("background-color: rgb(20, 23, 40);")
        log_content = FileOper.load_log_file("app.log")
        self.textEdit.setHtml(log_content)
        self.textEdit.setFixedSize(1000, 400)
        # 设置为不可编辑
        self.textEdit.setReadOnly(True)
        layout.addWidget(self.textEdit)

        self.setLayout(layout)
