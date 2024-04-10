import platform

import cv2
import numpy as np
import pyautogui

import Utils.DataUtils as Data

# 获取屏幕分辨率
screen_width, screen_height = pyautogui.size()


def cv(image_path):
    """
    识别图片
    :param image_path: 图片路径
    :return: 返回图片中心坐标
    """
    cv_type = Data.settings.value("cv_type")
    # 1:默认，2：特征，3：等比
    if cv_type == 2:
        cv_flann(image_path)
    if cv_type == 3:
        cv_resize(image_path)
    else:
        cv_default(image_path)


def cv_default(image_path):
    """
    识别指定图片
    :param image_path: 图片路径
    :return: 返回图片中心坐标
    """
    img = cv2.imread(image_path)
    button_x, button_y = pyautogui.locateCenterOnScreen(img, confidence=0.8)
    print(f"识别到图像：{button_x}, {button_y}")


def cv_resize(image_path, percent=None):
    """
    缩放比例识别
    :param image_path: 图片路径
    :param percent 缩放比例
    :return: 返回图片中心坐标
    """
    # 比对图片
    img = cv2.imread(image_path)
    # 比对比例，当前图片基于2k分辨率截取，则1080p
    height, width, _ = img.shape
    # 比例默认1，本地资源是2k，则需要用当前分辨率高度 / 2k分辨率 1440
    scale_percent = percent if percent is not None else screen_height / 1440
    new_width = int(width * scale_percent)
    new_height = int(height * scale_percent)
    # 调整图像大小
    img = cv2.resize(img, (new_width, new_height))
    button_x, button_y = pyautogui.locateCenterOnScreen(img, confidence=0.8)
    print(f"识别到图像：{button_x}, {button_y}")


def cv_flann(image_path):
    """
    特征比对方式
    :param image_path: 图片路径
    :return:
    """
    screenImg = pyautogui.screenshot()
    screenImg = cv2.cvtColor(np.array(screenImg), cv2.IMREAD_GRAYSCALE)
    # 用来对比识别的图片，比如某个按钮的截图
    img2 = cv2.imread(image_path, cv2.IMREAD_GRAYSCALE)

    # 初始化 SIFT 检测器
    sift = cv2.SIFT_create()

    # 在图像中检测关键点和描述符
    keypoints1, descriptors1 = sift.detectAndCompute(screenImg, None)
    keypoints2, descriptors2 = sift.detectAndCompute(img2, None)

    # 使用 Flann 匹配器进行特征匹配
    flann = cv2.FlannBasedMatcher(dict(algorithm=1, trees=5), dict(checks=50))
    matches = flann.knnMatch(descriptors1, descriptors2, k=2)

    # 根据 Lowe's 算法进行筛选
    good_matches = []
    for m, n in matches:
        if m.distance < 0.7 * n.distance:
            good_matches.append(m)

    # 获取匹配点的坐标
    src_pts = np.float32([keypoints1[m.queryIdx].pt for m in good_matches]).reshape(-1, 1, 2)

    # 创建矩形框列表
    rectangles = []

    # 查找150 x 150范围内超过90个特征点的区域
    for i, point in enumerate(src_pts):
        count = 0
        for other_point in src_pts:
            if np.linalg.norm(point - other_point) < 150 and not np.array_equal(point, other_point):
                count += 1
        if count > 40:
            x, y = point[0]
            x1, y1 = max(0, int(x - 75)), max(0, int(y - 75))
            x2, y2 = min(screenImg.shape[1], int(x + 75)), min(screenImg.shape[0], int(y + 75))
            # 扩大矩形框为原来的1.2倍
            width = x2 - x1
            height = y2 - y1
            x1 = max(0, int(x1 - 0.1 * width))
            y1 = max(0, int(y1 - 0.1 * height))
            x2 = min(screenImg.shape[1], int(x2 + 0.1 * width))
            y2 = min(screenImg.shape[0], int(y2 + 0.1 * height))
            rectangles.append((x1, y1, x2, y2))

    # 计算所有矩形框的交集
    if rectangles:
        x1 = max(rect[0] for rect in rectangles)
        y1 = max(rect[1] for rect in rectangles)
        x2 = min(rect[2] for rect in rectangles)
        y2 = min(rect[3] for rect in rectangles)

        # 在img1上绘制最大交集的矩形框
        cv2.rectangle(screenImg, (x1, y1), (x2, y2), (0, 0, 255), 2)

        # 计算中心点坐标
        x = (x1 + x2) // 2
        y = (y1 + y2) // 2
        print(f"识别到图像：{x}, {y}")
        system = platform.system()

        if system == 'Darwin':
            return x / 2, y / 2
        else:
            return x, y
    print("未识别到图像特征")
