import os
import json
import sys


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
            time = c_list[0]
            level = c_list[1]
            content = c_list[2]
            template = f"<span style='color: rgb(255, 255, 255);font-size:14px;'>{time}</span> " \
                       f"<span style='color: rgb(180, 86, 142);font-size:14px;'> - {level} - </span> " \
                       f"<span style='color: rgb(86, 177, 110);white-space: pre-line;font-size:14px;'>{content}</span>"
            result.append(template)
        return "".join(result)
