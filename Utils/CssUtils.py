class BtnCss:

    @staticmethod
    def blue(btnObj):
        """蓝色按钮样式
        :param btnObj 按钮对象
        """
        btnObj.setStyleSheet(
            """
            QPushButton {
                background-color: #409EFF;
                border: 1px solid #409EFF;
                color: white;
                padding: 5px 10px;
                border-radius: 5px;
            }
            QPushButton:hover {
                background-color: #66b1ff;
            }
            """
        )

    @staticmethod
    def orange(btnObj):
        """橙色按钮样式
        :param btnObj 按钮对象
        """
        btnObj.setStyleSheet(
            """
            QPushButton {
                background-color: #ff7f00;
                border: 1px solid #ff7f00;
                color: white;
                padding: 5px 10px;
                border-radius: 5px;
            }
            QPushButton:hover {
                background-color: #ff7f00;
            }
            """
        )

    @staticmethod
    def red(btnObj):
        """红色按钮样式
        :param btnObj 按钮对象
        """
        btnObj.setStyleSheet(
            """
            QPushButton {
                background-color: #f56c6c;
                border: 1px solid #f56c6c;
                color: white;
                padding: 5px 10px;
                border-radius: 5px;
            }
            QPushButton:hover {
                background-color: #e6a8ad;
            }
            """
        )
