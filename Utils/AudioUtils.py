from PySide6.QtCore import QThread
from PySide6.QtMultimedia import QMediaPlayer, QAudioOutput
from PySide6.QtCore import QUrl
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
        # playsound(self.audio_path)

        # 创建 QMediaPlayer 对象
        player = QMediaPlayer()
        audio_output = QAudioOutput()  # 不能实例化为临时变量，否则被自动回收导致无法播放
        player.setAudioOutput(audio_output)
        audio_output.setVolume(1)
        # 设置媒体内容并播放音乐
        player.setSource(QUrl.fromLocalFile(self.audio_path))
        player.play()
        self.finished.emit()


class AudioFactory:
    @staticmethod
    def play_audio(audio_path: Constant.Audio):
        """
        音效播放器
        :param audio_path: 播放路径
        :return:
        """
        try:
            PlayAudio(audio_path).start()
        except Exception as e:
            print("播放失败")
