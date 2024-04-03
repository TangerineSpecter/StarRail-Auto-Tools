import os
import json


class FileOper:
    rel_path = os.path.dirname(os.path.dirname(__file__)) + '/Config/'

    @staticmethod
    def load_config_file(filename):
        """
        读取配置文件
        :param filename:  文件名
        :return: 文件内容
        """
        with open(FileOper.rel_path + filename, 'r', encoding='utf-8') as load_f:
            para_dict = json.load(load_f)
        return para_dict
