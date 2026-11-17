# -*- coding: utf-8 -*-
"""桌面观星的存档处理库。

  config/    密钥表、常量和数据路径
  core/      XXTEA、base64、zlib 等基础算法
  game/      协议密钥推导、存档格式和角色摘要
  capture/   HAR 解析、解密及云存档请求
  model.py   共享数据类

桌面入口为项目根目录的 desktop_main.py。
"""
import sys

# 在加载子模块前检查存档处理库需要的最低 Python 版本。
if sys.version_info < (3, 8):
    if sys.platform == 'win32':
        try:                      # 先把控制台切成 UTF-8，否则中文提示是乱码
            import ctypes
            ctypes.windll.kernel32.SetConsoleOutputCP(65001)
        except Exception:
            pass
    sys.exit('存档处理库需要 Python 3.8 或更高版本，当前是 %d.%d。\n'
             '桌面工程请使用 Python 3.11，并按 README 创建虚拟环境、安装依赖。'
             % sys.version_info[:2])

__version__ = '2.9.1'

__all__ = ['__version__']
