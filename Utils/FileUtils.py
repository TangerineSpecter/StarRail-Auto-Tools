import os
import json


class FileOper:
    rel_path = os.path.dirname(os.path.dirname(__file__)) + '/Config/'

    @staticmethod
    def load_file(filename):
        with open(FileOper.rel_path + filename, 'r', encoding='utf-8') as load_f:
            para_dict = json.load(load_f)
        return para_dict
