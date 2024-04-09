# 星穹铁道应用程序名称
app_name = 'StarRail.exe'

# 图标位置
icon = "../Resource/img/icon.png"

start_keyboard = "shift + r"
stop_keyboard = "shift + f"


class Audio:
    """
    播放音乐路径管理
    """

    base_path = "./resource/audio/"
    '''基础路径'''
    running = f"{base_path}running.mp3"
    '''运行中'''
    not_running = f"{base_path}not_running.mp3"
    '''未运行'''
