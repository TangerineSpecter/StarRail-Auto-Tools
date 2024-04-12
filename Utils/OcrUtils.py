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
        print(f"ocr识别结果：{text_arr}")
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
            OcrUtils.ocr = PaddleOCR(use_angle_cls=True, use_gpu=True, ocr_version='PP-OCRv4')
            print("OCR 初始化完成")
