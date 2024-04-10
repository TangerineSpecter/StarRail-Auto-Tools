import json
import os
import sys

# 日志级别字典
level_color_dict = {
    "DEBUG": "rgb(64, 126, 210)",
    "INFO": "rgb(64, 126, 210)",
    "WARNING": "rgb(232, 232, 86)",
    "ERROR": "rgb(180, 86, 142)",
    "FATAL": "rgb(201, 83, 81)"
}


class FileOper:
    if getattr(sys, 'frozen', False):
        # 如果是打包后的可执行文件
        rel_path = os.path.abspath('/Config/')
        print(rel_path)
    else:
        # 如果是直接运行的脚本
        rel_path = os.path.dirname(os.path.dirname(__file__)) + '/Config/'

    @staticmethod
    def load_config_file(filename):
        """
        读取配置文件
        :param filename:  文件名
        :return: 文件内容
        """
        with open(os.path.join(FileOper.rel_path, filename), 'r', encoding='utf-8') as load_f:
            para_dict = json.load(load_f)
        return para_dict

    @staticmethod
    def load_file(filename, reverse=False):
        """
        读取文件
        :param filename:  文件名
        :param reverse：是否反向读取
        :return: 文件内容
        """
        with open(filename, 'r', encoding='utf-8') as file:
            content = file.readlines()
        if reverse:
            content.reverse()
        return "".join(content)

    @staticmethod
    def load_log_file(filename):
        """
        读取文件
        :param filename:  文件名
        :return: 文件内容
        """
        with open(filename, 'r', encoding='utf-8') as file:
            content = file.readlines()
        content.reverse()
        result = []
        for c in content:
            c_list = c.split(" - ")
            if len(c_list) < 3:
                log = f"<span style='color: rgb(180, 86, 142);'>{c}</span><br>"
            else:
                time = c_list[0]
                level = c_list[1]
                text = c_list[2]
                log = f"<span style='color: rgb(255, 255, 255);'>{time} |</span> " \
                      f"<span style='color: {level_color_dict.get(level, 'white')};'>{level.ljust(7, ' ').replace(' ', '&nbsp;')}</span> " \
                      f"<span style='color: rgb(86, 177, 110);white-space: pre-line;'>| {text}</span>"
            template = f"<span style='font-size:14px;font-family:Courier;'>{log}</span>"
            result.append(template)
        return "".join(result)


if __name__ == '__main__':
    with open("../app.log", 'r', encoding='utf-8') as file:
        content = file.read()
    print(content)
