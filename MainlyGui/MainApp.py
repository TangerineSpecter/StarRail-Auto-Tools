# -*- coding: utf-8 -*-

################################################################################
## Form generated from reading UI file 'StarRail.ui'
##
## Created by: Qt User 丢失的橘子 Interface Compiler version 6.6.2
##
## WARNING! All changes made in this file will be lost when recompiling UI file!
################################################################################

import platform

from PySide6.QtCore import (QCoreApplication, QMetaObject, QRect)
from PySide6.QtGui import (QAction, QIcon)
from PySide6.QtWidgets import (QGridLayout, QMenu, QGroupBox,
                               QMenuBar, QWidget, QMessageBox, QPushButton, QTextEdit, QLabel, QVBoxLayout,
                               QStatusBar, QDialog)

if platform.system() == 'Windows':
    import wmi

    pass
from Utils.CssUtils import (BtnCss)
from Utils.FileUtils import FileOper
import Config.SystemInfo as SystemInfo
import Config.LoggingConfig as Logging
import Config.UpdateLog as UpdateInfo
import Utils.DataUtils as Data
import Utils.Constant as Constant

# 系统信息
systemInfo = SystemInfo.base_info


class MainApp(object):

    def __init__(self, MainWindow):
        self.changeOut = MainWindow.changeOut
        Logging.info("启动应用程序")
        # 初始化窗体基本信息
        MainWindow.setObjectName(u"MainWindow")
        MainWindow.setFixedSize(640, 500)
        MainWindow.setWindowIcon(QIcon(Data.getResourcePath(Constant.icon)))
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

        # 初始化提示
        self.__init_tips()

        QMetaObject.connectSlotsByName(MainWindow)

    def __initButton(self):
        """
        初始化按钮
        """
        # 启动
        self.startGameBtn = QPushButton(self.centralWidget)
        self.startGameBtn.setObjectName(u"startGameBtn")
        self.startGameBtn.setGeometry(QRect(530, 10, 80, 40))
        self.startGameBtn.clicked.connect(self.start_net)
        self.startGameBtn.setText(QCoreApplication.translate("MainWindow", "开启", None))

        # 停止网络
        self.stopBtn = QPushButton(self.centralWidget)
        self.stopBtn.setObjectName(u"startGameBtn")
        self.stopBtn.setGeometry(QRect(530, 80, 80, 40))
        self.stopBtn.clicked.connect(self.stop_net)
        self.stopBtn.setText(QCoreApplication.translate("MainWindow", "停止", None))

        # 保存网络配置
        self.saveBtn = QPushButton(self.centralWidget)
        self.saveBtn.setObjectName(u"startGameBtn")
        self.saveBtn.setGeometry(QRect(530, 150, 80, 40))
        self.saveBtn.clicked.connect(self.save_setting)
        self.saveBtn.setText(QCoreApplication.translate("MainWindow", "保存", None))

        # 日志
        self.logBtn = QPushButton(self.centralWidget)
        self.logBtn.setObjectName(u"logBtn")
        self.logBtn.setGeometry(QRect(530, 220, 80, 40))
        self.logBtn.clicked.connect(show_log)
        self.logBtn.setText(QCoreApplication.translate("MainWindow", "日志", None))
        pass

    def __initLabel(self):
        """
        初始化说明标签
        """
        # 注意事项
        self.textLabel = QLabel(self.centralWidget)
        self.textLabel.setObjectName(u"textLabel")
        self.textLabel.setGeometry(QRect(20, 432, 558, 16))
        self.textLabel.setStyleSheet("color: red;")
        self.textLabel.setText(
            QCoreApplication.translate("MainWindow",
                                       f"说明：此工具用于进行手动网络切换，仅支持Windows以及以太网络使用。^_^", None))
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

        # 说明
        self.explainLabel = QLabel(self.centralWidget)
        self.explainLabel.setObjectName(u"explainLabel")
        self.explainLabel.setGeometry(QRect(20, 10, 161, 40))
        self.explainLabel.setText(QCoreApplication.translate("MainWindow", "当前状态：", None))

        self.gamePathText = QTextEdit(self.centralWidget)
        self.gamePathText.setObjectName(u"gamePathText")
        self.gamePathText.setGeometry(QRect(100, 10, 400, 40))
        self.gamePathText.setReadOnly(True)
        self.gamePathText.setPlaceholderText(QCoreApplication.translate("MainWindow", "运行状态", None))
        self.gamePathText.setText("未启动")

        # 路径框
        # self.gamePathText = QTextEdit(self.centralWidget)
        # self.gamePathText.setObjectName(u"gamePathText")
        # self.gamePathText.setGeometry(QRect(10, 10, 500, 40))
        # self.gamePathText.setReadOnly(True)
        # self.gamePathText.setPlaceholderText(QCoreApplication.translate("MainWindow", "游戏启动路径", None))

        # 设置部分窗体
        self.groupBox = QGroupBox(self.centralWidget)
        self.groupBox.setObjectName(u"groupBox")
        self.groupBox.setGeometry(QRect(20, 70, 500, 360))
        self.groupBox.setTitle(QCoreApplication.translate("MainWindow", "网络配置", None))

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
        self.startAction = QAction(MainWindow)
        self.startAction.setObjectName(u"startAction")
        self.startAction.triggered.connect(lambda: self.start_net)
        self.startAction.setText(QCoreApplication.translate("MainWindow", "开启", None))

        # 停止
        self.stopAction = QAction(MainWindow)
        self.stopAction.setObjectName(u"stopAction")
        self.stopAction.triggered.connect(lambda: self.stop_net)
        self.stopAction.setText(QCoreApplication.translate("MainWindow", "停止", None))

        # 关于
        self.aboutAction = QAction(MainWindow)
        self.aboutAction.setObjectName(u"aboutAction")
        self.aboutAction.triggered.connect(show_about_dialog)
        self.aboutAction.setText(QCoreApplication.translate("MainWindow", "关于", None))

        # 更新记录
        # self.updateLogAction = QAction(MainWindow)
        # self.updateLogAction.setObjectName(u"updateLogAction")
        # self.updateLogAction.triggered.connect(show_update_log)
        # self.updateLogAction.setText(QCoreApplication.translate("MainWindow", "更新记录", None))

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
        self.menu1 = QMenu(self.menubar)
        self.menu1.setObjectName(u"menu1")
        MainWindow.setMenuBar(self.menubar)
        # 菜单栏 2
        self.menu2 = QMenu(self.menubar)
        self.menu2.setObjectName(u"menu2")
        MainWindow.setMenuBar(self.menubar)

        self.menubar.addAction(self.menu1.menuAction())
        self.menubar.addAction(self.menu2.menuAction())
        # 绑定下拉
        self.menu1.addAction(self.startAction)
        self.menu1.addAction(self.stopAction)
        self.menu1.addAction(self.aboutAction)
        self.menu1.setTitle(QCoreApplication.translate("MainWindow", "文件", None))
        self.menu2.addAction(self.logAction)
        self.menu2.setTitle(QCoreApplication.translate("MainWindow", "帮助", None))

    def __initStyle(self):
        """
        样式设置
        """
        BtnCss.orange(self.saveBtn)
        BtnCss.blue(self.startGameBtn)
        BtnCss.red(self.stopBtn)
        BtnCss.purple(self.logBtn)
        # icon设置
        self.stopBtn.setIcon(QIcon(Data.getResourcePath("Resource/icon/remove.png")))
        self.logBtn.setIcon(QIcon(Data.getResourcePath("Resource/icon/log.png")))
        self.startGameBtn.setIcon(QIcon(Data.getResourcePath("Resource/icon/start.png")))
        self.saveBtn.setIcon(QIcon(Data.getResourcePath("Resource/icon/setting.png")))

    def __init_tips(self):
        """
        初始化提示
        """
        self.startGameBtn.setToolTip("启用当前网络配置")
        self.stopBtn.setToolTip("关闭当前网络配置")
        self.logBtn.setToolTip("脚本执行记录")
        self.saveBtn.setToolTip("保存当前网络配置")

    def save_setting(self):
        """
        保存当前网络配置
        :return:
        """
        ip_address = self.ipAddressText.toPlainText()
        subnet_mask = self.subnetMaskText.toPlainText()
        gate_way = self.gatewayText.toPlainText()
        first_dns = self.firstDnsText.toPlainText()

        Data.settings.setValue("ip_address", ip_address)
        Data.settings.setValue("subnet_mask", subnet_mask)
        Data.settings.setValue("gate_way", gate_way)
        Data.settings.setValue("first_dns", first_dns)
        self.setStatusText("配置保存成功")
        self.showMsg("配置保存成功")

    def start_net(self):
        """
        启用当前网路配置
        :return:
        """
        if platform.system() == 'Windows':
            # 连接 WMI
            c = wmi.WMI()
            # 获取网络适配器配置
            net_adapters = c.Win32_NetworkAdapterConfiguration(IPEnabled=True)

            for adapter in net_adapters:
                # 判断是否为以太网连接
                if "Ethernet" in adapter.Description:
                    try:
                        # 数据初始化
                        ip_address = self.ipAddressText.toPlainText()
                        subnet_mask = self.subnetMaskText.toPlainText()
                        gate_way = self.gatewayText.toPlainText()
                        first_dns = self.firstDnsText.toPlainText()

                        # 检测
                        self.check_ip(ip_address)
                        self.check_ip(subnet_mask)
                        self.check_ip(gate_way)
                        self.check_ip(first_dns)

                        # 启用Ipv4网络设置
                        result = adapter.SetIPConnectionEnabled(Enabled=True)
                        # 禁用DHCP自动获取
                        result = adapter.SetDHCPEnabled(Index=adapter.Index, Enabled=False)
                        # 设置静态 IP 地址、子网掩码、网关和 DNS 服务器
                        result = adapter.EnableStatic(IPAddress=[ip_address], SubnetMask=[subnet_mask])
                        result = adapter.SetGateways(DefaultIPGateway=[gate_way])
                        result = adapter.SetDNSServerSearchOrder(DNSServerSearchOrder=[first_dns])
                        self.showMsg("启用成功")
                        self.gamePathText.setText("启用成功，当前模式：手动获取")
                        self.setStatusText("运行中")
                    except Exception as e:
                        self.showMsg("启用配置失败")
                        self.gamePathText.setText("启用配置异常，检查日志")
                        Logging.error("启用异常：" + str(e))
                else:
                    self.showMsg("此网络连接不是以太网连接，不进行修改")
                    self.gamePathText.setText("此网络连接不是以太网连接，不进行修改")
        else:
            self.showMsg("仅支持window使用")
            self.gamePathText.setText("系统不支持")

    def stop_net(self):
        """
        关闭当前网络配置
        :return:
        """
        if platform.system() == 'Windows':
            # 连接 WMI
            c = wmi.WMI()
            # 获取网络适配器配置
            net_adapters = c.Win32_NetworkAdapterConfiguration(IPEnabled=True)

            for adapter in net_adapters:
                # 判断是否为以太网连接
                if "Ethernet" in adapter.Description:
                    try:
                        # 启用DHCP自动获取
                        result = adapter.SetDHCPEnabled(Index=adapter.Index, Enabled=False)
                        self.showMsg("关闭成功")
                        self.gamePathText.setText("关闭成功，当前模式：自动获取")
                        self.setStatusText("待机中")
                    except Exception as e:
                        self.showMsg("关闭配置失败")
                        self.gamePathText.setText("关闭配置异常，检查日志")
                        Logging.error("关闭异常：" + str(e))
                else:
                    self.showMsg("此网络连接不是以太网连接，不进行修改")
                    self.gamePathText.setText("此网络连接不是以太网连接，不进行修改")
        else:
            self.showMsg("仅支持window使用")
            self.gamePathText.setText("系统不支持")

    def check_ip(self, ip):
        """
        ip格式校验
        :return:
        """
        if len(ip) <= 0:
            self.showMsg("配置信息缺失")
            return

        parts = ip.split(".")
        if len(parts) != 4:
            self.showMsg("网络配置格式错误")
            return
        for part in parts:
            if not part.isdigit():
                self.showMsg("网络配置格式错误")
                return
            i = int(part)
            if i < 0 or i > 255 or (len(part) > 1 and part[0] == '0'):
                self.showMsg("网络配置数值非0~255之间")
                return

    def setStatusText(self, text):
        self.runStatusLabel.setText(f"当前状态：{text}")

    def showMsg(self, text):
        QMessageBox.information(self.centralWidget, '提示', text, QMessageBox.Ok)
        return

    def changeStatusLabel(self, text):
        self.changeOut.emit(text)
        return

    def __initData(self):
        """
        初始化面板数据部分
        """
        self.ipLabel = QLabel(self.groupBox)
        self.ipLabel.setObjectName(u"ipLabel")
        self.ipLabel.setGeometry(QRect(15, 50, 161, 16))
        self.ipLabel.setText(QCoreApplication.translate("MainWindow", "IP地址：", None))

        self.ipAddressText = QTextEdit(self.groupBox)
        self.ipAddressText.setObjectName(u"ipAddressText")
        self.ipAddressText.setGeometry(QRect(125, 40, 330, 40))
        self.ipAddressText.setPlaceholderText(QCoreApplication.translate("MainWindow", "IP地址", None))

        self.subnetMaskLabel = QLabel(self.groupBox)
        self.subnetMaskLabel.setObjectName(u"subnetMaskLabel")
        self.subnetMaskLabel.setGeometry(QRect(15, 100, 161, 16))
        self.subnetMaskLabel.setText(QCoreApplication.translate("MainWindow", "子网掩码：", None))

        self.subnetMaskText = QTextEdit(self.groupBox)
        self.subnetMaskText.setObjectName(u"subnetMaskText")
        self.subnetMaskText.setGeometry(QRect(125, 90, 330, 40))
        self.subnetMaskText.setPlaceholderText(
            QCoreApplication.translate("MainWindow", "子网掩码，比如255.255.255.0", None))

        self.gatewayLabel = QLabel(self.groupBox)
        self.gatewayLabel.setObjectName(u"gatewayLabel")
        self.gatewayLabel.setGeometry(QRect(15, 150, 161, 16))
        self.gatewayLabel.setText(QCoreApplication.translate("MainWindow", "网关：", None))

        self.gatewayText = QTextEdit(self.groupBox)
        self.gatewayText.setObjectName(u"gatewayText")
        self.gatewayText.setGeometry(QRect(125, 140, 330, 40))
        self.gatewayText.setPlaceholderText(QCoreApplication.translate("MainWindow", "网关", None))

        self.firstDnsLabel = QLabel(self.groupBox)
        self.firstDnsLabel.setObjectName(u"firstDnsLabel")
        self.firstDnsLabel.setGeometry(QRect(15, 200, 161, 16))
        self.firstDnsLabel.setText(QCoreApplication.translate("MainWindow", "首选DNS：", None))

        self.firstDnsText = QTextEdit(self.groupBox)
        self.firstDnsText.setObjectName(u"firstDnsText")
        self.firstDnsText.setGeometry(QRect(125, 190, 330, 40))
        self.firstDnsText.setPlaceholderText(QCoreApplication.translate("MainWindow", "首选DNS", None))

        # 数据
        ip_address = Data.settings.value("ip_address", None)
        if ip_address is not None:
            self.ipAddressText.setText(ip_address)

        subnet_mask = Data.settings.value("subnet_mask", None)
        if subnet_mask is not None:
            self.subnetMaskText.setText(subnet_mask)

        gate_way = Data.settings.value("gate_way", None)
        if gate_way is not None:
            self.gatewayText.setText(gate_way)

        first_dns = Data.settings.value("first_dns", None)
        if first_dns is not None:
            self.firstDnsText.setText(first_dns)


class AboutDialog(QMessageBox):
    def __init__(self, parent=None):
        super(AboutDialog, self).__init__(parent)
        self.setWindowTitle("关于")
        self.setText(f"版本号：{systemInfo['version']}\n"
                     f"作者：{systemInfo['author']}\n"
                     f"Bug反馈邮箱：{systemInfo['email']}")
        self.exec()


def setting_cv_type(cv_type):
    """
    设置识别方式
    :param cv_type:
    :return:
    """
    print(f"设置识别方式{cv_type}")
    Data.settings.setValue("cv_type", cv_type)


# 关于对话框
def show_about_dialog():
    AboutDialog()


def show_log():
    """
    打开日志
    """
    sub_window = SubLogWindow()
    # 设置为模态对话框
    sub_window.setModal(True)
    sub_window.exec()


class SubLogWindow(QDialog):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("查看日志")

        layout = QVBoxLayout()
        self.textEdit = QTextEdit()
        self.textEdit.setStyleSheet("background-color: rgb(20, 23, 40);")
        log_content = FileOper.load_log_file("app.log")
        self.textEdit.setHtml(log_content)
        self.textEdit.setFixedSize(1000, 400)
        # 设置为不可编辑
        self.textEdit.setReadOnly(True)
        layout.addWidget(self.textEdit)

        self.setLayout(layout)


def show_update_log():
    """
    更新记录
    """
    sub_window = SubUpdateWindow()
    # 设置为模态对话框
    sub_window.setModal(True)
    sub_window.exec()


class SubUpdateWindow(QDialog):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("更新记录")

        layout = QVBoxLayout()
        self.textEdit = QTextEdit()
        update_log = UpdateInfo.update_log
        dialog_content = []
        for info in update_log:
            c = f"<h3 style='text-align: center;'>更新版本：{info['version']}</h3>" \
                f"<ul>"
            for text in info['content']:
                c += f"<li>{text}</li>"
            c += "</ul>"
            dialog_content.append(c)
        self.textEdit.setHtml("<br>".join(dialog_content))
        self.textEdit.setFixedSize(500, 600)
        # 设置为不可编辑
        self.textEdit.setReadOnly(True)
        layout.addWidget(self.textEdit)

        self.setLayout(layout)
