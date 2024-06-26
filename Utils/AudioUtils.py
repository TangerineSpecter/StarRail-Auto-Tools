from PySide6.QtCore import QThread
from playsound import playsound

import Utils.Constant as Constant

"""
音乐工具类
"""


class PlayAudio(QThread):
    """
    播放音效
    """

    def __init__(self, audio_path):
        super().__init__()
        self.audio_path = audio_path

    def run(self):
        try:
            playsound(self.audio_path)
            self.finished.emit()
        except Exception as e:
            print("播放失败，异常：", e)


class AudioFactory:
    @staticmethod
    def play_audio(audio_path: Constant.Audio):
        """
        音效播放器
        :param audio_path: 播放路径
        :return:
        """
        PlayAudio(audio_path).start()
