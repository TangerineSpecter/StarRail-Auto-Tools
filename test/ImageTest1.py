import cv2
import numpy as np

# 读取图像
img = cv2.imread("img_2.png")
thres_min = 150  # 二值化最小阈值

if not img is None:
    # 二值化处理
    ret, img = cv2.threshold(img, thres_min, 255, cv2.THRESH_BINARY)
    cv2.imshow("img_thres", img)

    # img备份，转换为灰度图，并反转
    copy = img.copy()
    copy = cv2.cvtColor(copy, cv2.COLOR_BGR2GRAY)
    ret, copy = cv2.threshold(copy, thres_min, 255, cv2.THRESH_BINARY_INV)
    cv2.imshow("copy", copy)

    # 查找轮廓，并绘制在全黑图像上
    contours, hierarchy = cv2.findContours(copy, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    draw = np.zeros_like(img)
    cv2.drawContours(draw, contours, 0, (255, 255, 255), -2)
    cv2.imshow("img2", draw)

    # 进行膨胀腐蚀操作
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (19, 19))
    dilated = cv2.dilate(draw, kernel, iterations=2)
    cv2.imshow("dilate", dilated)
    eroded = cv2.erode(dilated, kernel, iterations=2)
    cv2.imshow("erode", eroded)

    # 膨胀腐蚀相减
    diff = cv2.absdiff(dilated, eroded)
    diff = cv2.cvtColor(diff, cv2.COLOR_BGR2GRAY)
    cv2.imshow("diff", diff)

    # 在差异图diff中查找轮廓，并在原图上绘制轮廓
    contours2, hierarchy2 = cv2.findContours(diff, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    cv2.drawContours(img, contours2, 0, (0, 0, 255), -1)
    cv2.imshow("result", img)

cv2.waitKey(0)
