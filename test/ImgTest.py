import cv2 as cv
import numpy as np

if __name__ == '__main__':
    # 使用cv.imread()函数读取指定路径的图片，并将其保存到变量img中
    img = cv.imread("img_3.png")

    # 使用cv.cvtColor()函数将img从BGR色彩空间转换为灰度色彩空间，并保存到变量gray中
    gray = cv.cvtColor(img, cv.COLOR_BGR2GRAY)

    # 使用cv.threshold()函数对灰度图像进行阈值化处理，将像素值高于127的部分设为255，低于127的部分设为0，并保存结果到变量ret和thresh中
    ret, thresh = cv.threshold(gray, 127, 255, cv.THRESH_BINARY_INV + cv.THRESH_OTSU)

    # 使用cv.findContours()函数查找二值化图像中的轮廓，并保存结果到变量contours和herarchy中
    contours, herarchy = cv.findContours(thresh, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE)

    # 创建一个与img大小相同，所有像素值为0的空图像，并保存到变量draw中
    draw = np.zeros_like(img)

    # 使用cv.drawContours()函数在空图像draw上画出轮廓，轮廓颜色为(255,0,255)，即洋红色，轮廓线宽为-1（实线）
    cv.drawContours(draw, contours, 0, (255, 0, 255), -1)

    # 使用cv.getStructuringElement()函数获取一个形态学结构元素，形状为矩形，大小为(19,19)，并保存到变量krenel中
    krenel = cv.getStructuringElement(cv.MORPH_RECT, (19, 19))

    # 使用cv.dilate()函数对图像进行膨胀操作，并保存结果到变量dilated中
    dilated = cv.dilate(draw, krenel, iterations=2)

    # 使用cv.erode()函数对图像进行腐蚀操作，并保存结果到变量eroded中
    eroded = cv.erode(dilated, krenel, iterations=2)

    # 使用cv.absdiff()函数计算膨胀和腐蚀后的图像的绝对差，并保存到变量diff中
    diff = cv.absdiff(dilated, eroded)

    # 使用cv.cvtColor()函数将diff从BGR色彩空间转换为灰度色彩空间，并保存到变量diff中
    diff = cv.cvtColor(diff, cv.COLOR_BGR2GRAY)

    # 使用cv.findContours()函数查找diff中的轮廓，并保存结果到变量contours2和herarchy2中
    contours2, herarchy2 = cv.findContours(diff, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE)

    # 使用cv.drawContours()函数在原图img上画出轮廓，轮廓颜色为(0,0,255)，即蓝色，轮廓线宽为-1（实线）
    cv.drawContours(img, contours2, 0, (0, 0, 255), -1)

    # 使用cv.imshow()函数显示处理后的图像，窗口名为'demo'
    cv.imshow('demo', img)

    # 使用cv.waitKey()函数等待用户按键，该函数的参数为0表示无限等待直到用户按下键盘上的任意键后才继续执行下面的代码
    cv.waitKey(0)


def demo1():
    image = cv.imread("map2.png")

    # 将图像转换为灰度图像
    gray = cv.cvtColor(image, cv.COLOR_BGR2GRAY)

    # 使用Canny边缘检测找到黑线轮廓
    edges = cv.Canny(gray, 50, 150)

    cv.imshow('Detected Paths', edges)
    cv.waitKey(0)

    # 找到黑线轮廓
    contours, _ = cv.findContours(edges, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE)

    # 绘制可移动路线（红色线条）
    for contour in contours:
        if cv.contourArea(contour) > 100:  # 设置轮廓的最小面积阈值
            cv.drawContours(image, [contour], -1, (0, 0, 255), 2)

    # 显示结果图像
    cv.imshow('Detected Paths', image)
    cv.waitKey(0)
    cv.destroyAllWindows()
