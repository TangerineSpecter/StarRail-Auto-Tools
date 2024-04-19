"""
ocr识别
"""
from PySide6.QtCore import QThread
from paddleocr import PaddleOCR


class OcrUtils:
    ocr = None


def ocr_img(img):
    """
    识别图片，并返回识别度最高的文本内容
    :param img: 图片
    :return: 文本
    """
    try:
        text_arr = OcrUtils.ocr(img, cls=True)
        # print(f"ocr识别结果：{text_arr}")
        ocr_all_text = text_arr[1]
        # 识别文本内容为空，则说明无内容
        if len(ocr_all_text) == 0:
            return None
        return text_arr[1][0][0]
    except Exception as e:
        print("识别异常：", e)
    return None


class InitOcrThread(QThread):

    def run(self):
        if not OcrUtils.ocr:
            OcrUtils.ocr = PaddleOCR(
                use_angle_cls=False,  # 关闭角度分类
                use_gpu=False,  # 不使用 GPU 加速
                use_gpu_mem_opt=False,  # 不使用 GPU 内存优化
                det=False,  # 不进行文本检测
                rec=True,  # 进行文字内容识别
                rec_model_dir='ch',  # 选择中文识别模型
                lang='ch',  # 设置识别语言为中文
                use_space_char=True,  # 使用空格字符分隔识别结果
                ocr_version='PP-OCRv4')
            print("OCR 初始化完成")
