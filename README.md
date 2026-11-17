# ios观星工具iosGuanxing3.0正式发布
### 已适配ios国服73576--ios国际服73680--ios先行服73580

烟雨观星 Windows 桌面预览版。基于 gx2.8 的存档解析与网页功能，使用 PySide6 / Qt WebEngine 内置显示网页，不再打开 CMD 或外部浏览器。
<img width="1382" height="932" alt="QQ_1794104039633" src="https://github.com/user-attachments/assets/f217df74-db5f-401a-98de-385a44064c8b" />

## 使用

Windows 10/11 x64 下载 Release 中的 `iosGuanxing.exe`，直接运行。

如果下载的是源码，按下方的 [Windows 源码安装与启动](#windows-源码安装与启动) 操作。

1. 选择或拖入 ProxyPin 导出的 HAR，自动向游戏服务器下载当前云存档。
   若主动下载失败（常见：登录会话已过期、断网），而抓包里本身带着完整存档（国际服等旧式明文 download 响应），会自动改为离线导入这次抓包里的存档快照，并在提示中说明来源。
2. 下载成功后自动进入内置观星主页。
3. 后续点击“下载最新云存档”；登录会话失效后重新导入 HAR。有效期以服务器响应为准，与游戏版本号无直接对应关系。

启动只恢复上次选中的本地存档，不自动联网。历史存档可离线查看。下载只读取服务器已保存的进度，不会上传或覆盖游戏存档。
<img width="1382" height="932" alt="QQ20261108-101424" src="https://github.com/user-attachments/assets/defbd3b7-8997-47bc-a04f-f9243ef885d7" />


## iOS抓包

- 安装免费开源抓包工具 ProxyPin ，手机直接去AppStore即可安装

### 抓包流程

1.打开proxyin，点击右下角开始，开启抓包（无需开启HTTPS代理）  
2.进入游戏主页面，（未登录请先登录，为防止丢失数据请先点击左下角[上传]），点击左下角[下载]  
3.回到proxypin，点击右下角停止，结束抓包  
4.proxypin右上角三点 —— 视图导出 —— （新版本要选择HAR格式）  
5.将导出的结果传输到电脑  
6.将har文件拖动至ios.exe内并回车即可完成导入

## 本地数据

数据位于 `%LOCALAPPDATA%\iosGuanxing`。每次成功下载建立独立快照，失败保留原有记录。HAR 原文件不复制；复用所需的登录会话使用 Windows DPAPI 加密，仅当前 Windows 用户可解密。快照是本地明文游戏数据，请自行保管。

下载失败时，完整诊断（错误类型、HTTP 状态码、响应片段、堆栈）会写入数据目录的 `last_error.log`，仅保存在本机；排障时可把它发给维护者。界面提示只显示安全摘要，不展示账号、请求头和原始响应。

内置网页仅访问程序自己的本机随机端口。关闭程序时停止服务。网页运行状态保存在内存中，退出后清除；存档快照单独保留。界面设置、模拟器临时操作在首版中不会跨重启保存。

## 开发与构建

### Windows 源码安装与启动

先安装 Windows 版 64 位 Python 3.11 和 Python 启动器（`py`）。在项目根目录打开终端，执行对应的一组命令。

`requirements-desktop.txt` 包含运行依赖和 PyInstaller 打包工具。安装完成后即可运行源码或生成 EXE。

**Git Bash / UCRT64**（提示符末尾是 `$`）

```bash
py -3.11 -m venv .venv &&
./.venv/Scripts/python.exe -m pip install -r requirements-desktop.txt &&
./.venv/Scripts/python.exe desktop_main.py
```

**PowerShell**（提示符以 `PS` 开头）。逐行执行，每一步成功后再执行下一步。

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-desktop.txt
.\.venv\Scripts\python.exe desktop_main.py
```

最后一行会打开观星窗口。以后双击仓库里的 `启动观星.cmd` 即可。若已经有 `.venv`，但提示 `No module named 'PySide6'`、`No module named 'xxtea'` 或 `No module named 'PyInstaller'`，重新执行安装依赖的命令，等它成功结束后再启动或打包。

若第一步之后提示找不到 `py` 或 Python 3.11，请在当前终端运行 `py -3.11 --version` 检查。安装 Windows 版 Python 3.11 和启动器后重新打开终端，确认显示 `Python 3.11.x` 再继续。

正式目标为 Windows，其他平台开发预览不持久化登录会话。

### 测试与打包

在 PowerShell 中使用项目的虚拟环境运行离线测试和内置网页验证：

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
.\.venv\Scripts\python.exe dev/smoke_desktop.py
```

需要生成单文件 EXE 时，在 PowerShell 中执行：

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements-desktop.txt
.\打包观星.cmd
```

Git Bash / UCRT64 中执行：

```bash
./.venv/Scripts/python.exe -m pip install -r requirements-desktop.txt &&
./打包观星.cmd
```

以后修改代码后双击 `打包观星.cmd` 即可重新打包，输出文件为 `dist\iosGuanxing.exe`。依赖文件更新后，先重新运行安装依赖的命令。推送 `v*` 标签自动构建预览 Release，发布 EXE 与 SHA256 校验文件。

首版使用临时图标，EXE 未签名。自动测试使用合成存档和模拟下载，不连接游戏服务器；实际账号下载需要使用者在 Windows 上验收。
