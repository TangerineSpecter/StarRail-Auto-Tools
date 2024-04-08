import logging

# 日志
logging.basicConfig(filename='app.log', level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s',
                    datefmt='%Y-%m-%d %H:%M:%S', encoding='utf-8')


def info(text):
    logging.info(text)


def warn(text):
    logging.warning(text)


def error(text):
    logging.error(text)
