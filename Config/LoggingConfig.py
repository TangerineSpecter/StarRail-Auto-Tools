import logging

# 日志
logging.basicConfig(filename='app.log', level=logging.DEBUG, format='%(asctime)s - %(levelname)s - %(message)s')


def info(text):
    logging.info(text)


def warn(text):
    logging.warning(text)


def error(text):
    logging.error(text)