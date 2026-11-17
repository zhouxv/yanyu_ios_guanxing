# iosGuanxing 自用桌面版

烟雨江湖存档查看与模拟工具，面向 Windows 桌面使用。当前工程已合并上游 v3.0.8，并加入独立的「自动模拟（自用）」洗脉功能。

桌面窗口通过 PySide6 / Qt WebEngine 显示本地页面，支持读取存档、模拟操作和导出路线。生成的路线需要在游戏中手动执行。

## 工程功能

| 功能 | 用途 |
| --- | --- |
| 存档管理 | 导入 HAR、请求当前云存档、保存和打开历史快照 |
| 洗髓模拟 | 按存档状态模拟洗脉、锁脉、置换和序列查询 |
| 自动模拟 | 自动洗脉、自动洗脉（改进）、装备及剑王阁相关预测 |
| 自动模拟（自用） | 按层数搜索洗脉路线，支持手动丹数、参考路线、可选穷举与路线导出 |
| 装备模拟 | 打造、升炼、精炼、淬炼；包含 v3.0.8 的橙装图纸及对应 100 级装备材料 |
| 恒山模拟 | 弟子天赋刷新、升级和相关推演 |
| 角色面板与状态 | 查看角色属性、装备、天赋及培养进度 |
| 鬼市与恒山游货郎 | 根据存档查看货架并推演刷新序列 |

### 自用洗脉

入口为「自动模拟 → 自动模拟（自用）」。

1. 导入存档，选择人物、VIP、保留天赋和目标紫脉。
2. 设置「可用洗髓丹」和「最大耗丹数量」。
3. 选择策略 3、5 或 7 层，默认 5 层，开始搜索。
4. 策略结束后可点击「开始穷举」，也可在开始前勾选「策略结束后自动穷举」。搜索方式还提供「直接穷举」。
5. 查看候选路线和逐步丹耗，需要时导出文本。

「可用洗髓丹」默认读取背包，可手动修改，也可恢复存档丹数。它用于背包预算搜索和路线余量计算；「最大耗丹数量」是搜索上限，允许寻找超出当前背包数量的路线。修改搜索条件后需要重新搜索。切换人物保留手动丹数，重新导入存档后读取新存档丹数。

可载入 TXT / Markdown 参考路线，程序按当前存档回放和校验。策略搜索按层数推进，每层有工作量预算，候选路线可能继续被改进。穷举完成后，界面才会显示是否在本次模型、目标、开槽范围和丹药预算内证明最低丹耗。大范围穷举可能耗时较长，支持在当前页面暂停和继续；关闭页面后需重新搜索。

## 支持范围与版本限制

| 项目 | 当前范围 |
| --- | --- |
| 桌面系统 | Windows 10 / 11，x64 |
| 工程版本 | 当前基于上游 v3.0.8，版本定义位于 `desktop/__init__.py` |
| 源码环境 | Windows 版 Python 3.11，64 位；项目使用独立 `.venv` |
| 自用与改进自动洗脉界面 | 当前支持国服、先行服；界面会拒绝国际服存档 |
| 自用洗脉资质 | 150–154；按层策略主要处理三槽、四槽起点，较少槽数可用穷举检查开槽时机 |
| 目标与预算 | 最多四槽目标，可设置必选脉和兼容组；最大耗丹数量为 0–20,000 的整数 |
| 国际服 | HAR 导入包含国际服处理及完整存档回退；手动洗髓模拟保留国际服算法入口，具体数据需要对应渠道适配 |
| 游戏存档版本 | 解析依赖存档格式、内置密钥表和渠道；模拟依赖当前算法及数据表。游戏更新后需重新核对适配情况 |

工程版本号与游戏的 `DBVersion` 是不同信息。现有代码没有统一的游戏版本号白名单；存档成功导入后，仍应核对渠道、人物、天赋、丹数和实际操作结果。

自用搜索只计算洗髓丹，开槽所需资质等条件需要在游戏中满足。界面修改的丹数和模拟操作作用于本次推演。

## 环境设置与依赖安装

在项目根目录打开终端，选择对应的一组命令执行。

先安装 Windows 版 64 位 Python 3.11 和 Python 启动器 `py`，用 `py -3.11 --version` 确认可用。依赖清单 `requirements-desktop.txt` 统一包含 PySide6、xxtea 和 PyInstaller，安装后即可启动和打包。

| 依赖 | 清单中的版本约束 |
| --- | --- |
| PySide6 | Windows 固定为 6.10.2 |
| xxtea | 6.0 ≤ 版本 < 7 |
| PyInstaller | 6.10 ≤ 版本 < 7 |

### Git Bash / UCRT64

```bash
py -3.11 -m venv .venv &&
./.venv/Scripts/python.exe -m pip install -r requirements-desktop.txt &&
./.venv/Scripts/python.exe -m pip check &&
./.venv/Scripts/python.exe desktop_main.py
```

### PowerShell

逐行执行，每一步成功后再继续。

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-desktop.txt
.\.venv\Scripts\python.exe -m pip check
.\.venv\Scripts\python.exe desktop_main.py
```

以上命令直接使用项目虚拟环境中的 Python。以后可双击 `启动观星.cmd`。拉取代码后，如果依赖清单更新，重新运行对应终端的安装依赖命令。

遇到 `No module named 'PySide6'`、`No module named 'xxtea'` 或 `No module named 'PyInstaller'`，在同一个 `.venv` 中重新安装依赖，确认成功后再启动或打包。

Node.js 22 或更高版本用于 JavaScript 测试和洗脉性能对比。日常运行及本机 EXE 打包使用 Python 环境。

## 导入存档与日常使用

1. 双击 `启动观星.cmd`，或运行已打包的 `iosGuanxing.exe`。
2. 选择或拖入 HAR 文件。程序优先从 HAR 读取会话，向游戏服务器请求当前云存档。
3. 若下载失败，程序会尝试从 HAR 中读取完整存档，并显示实际使用的数据来源。HAR 只有部分响应或会话信息时，需要重新抓取。
4. 导入成功后进入各模拟页面；后续可用「下载最新云存档」刷新，或打开历史快照。

首页另有文件导入入口。通过首页导入的数据供本次网页模拟使用；原生历史快照由桌面的 HAR 导入和云存档下载流程保存。

获取 HAR 时，用 ProxyPin 等抓包工具记录游戏的登录及下载存档请求，再导出 HAR。云存档刷新依赖可用的网络和会话。存档加载后，各模拟功能在本机执行。

## 打包为单文件 EXE

安装依赖后双击 `打包观星.cmd`，或在终端执行。

Git Bash / UCRT64：

```bash
./.venv/Scripts/python.exe -m pip install -r requirements-desktop.txt &&
./打包观星.cmd
```

PowerShell：

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements-desktop.txt
.\打包观星.cmd
```

生成文件位于 `dist/iosGuanxing.exe`，可以单独复制运行。修改源码后需要重新打包，已有 EXE 才会包含新改动。打包脚本会检查 Python 和 PyInstaller，并限定打包时的 DLL 搜索目录。

## 本地数据与设置

- 历史存档、桌面偏好和诊断日志保存在 `%LOCALAPPDATA%\iosGuanxing`。
- Windows 会话凭据使用当前用户的 DPAPI 加密；历史存档快照以明文 JSON 保存。
- 搜索中的暂停状态限当前页面使用。关闭窗口会结束后台搜索。
- `启动观星.cmd` 设置 `IOSGUANXING_DISABLE_AUTO_UPDATE=1`，关闭启动时的自动更新检查。

桌面「检查更新」当前查询的是上游发布版本。获取包含自用功能的更新时，应拉取本仓库代码并重新打包。

## 工程结构与维护

| 路径 | 用途 |
| --- | --- |
| `desktop_main.py`、`desktop/` | 原生窗口、本机页面服务、存档管理和更新检查 |
| `web/` | 桌面内嵌页面、算法、数据表及 WASM 资源 |
| `web/shared/personal_wash*` | 自用洗脉界面和搜索实现 |
| `yyjh/`、`keys.json` | HAR、协议、解密和存档处理；目录中仍包含待核对的旧工具 |
| `assets/`、`iosGuanxing.spec` | 图标和单文件打包配置 |
| `tests/`、`dev/` | 回归测试、桌面检查及开发工具 |
| `.github/workflows/` | 自动测试与 Windows 构建发布 |

同步上游时，先合并上游正式标签并保持「自动洗脉（改进）」与上游一致，再评估是否将相关修复适配到自用模块。上游合并和自用适配分别提交。

### 验证命令

在 PowerShell 中运行后端与桌面检查：

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
.\.venv\Scripts\python.exe dev/smoke_desktop.py
.\.venv\Scripts\python.exe dev/check_auto_wash2.py
```

安装 Node.js 22+ 后，可在任一终端执行：

```text
node tests/test_personal_wash.cjs
node tests/test_auto_wash2.cjs
node tests/test_equipment_features.cjs
node tests/test_wash_dynamic_pool.cjs
node tests/test_wash_profile.cjs
```

桌面测试使用临时合成存档，覆盖导入、页面切换和搜索流程；真实游戏存档的预测结果还需按具体版本核对。

## 项目来源

本工程基于 [cunsesjh/yanyu_ios_guanxing](https://github.com/cunsesjh/yanyu_ios_guanxing)，在本仓库维护 Windows 自用桌面功能。
