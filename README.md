# IAG 灯光编排网页

[打开在线编排器](https://gem0816-1.github.io/iag-lighting-arranger/)

1. 打开网页，选一段本地音频或视频，也可以点「导入网址」。已有的 Resolve `.iagcue.json` 可以直接打开。
2. 播放或点击时间轴定位，再点「添加灯效」。拖动灯效可移动，选中后可改开始和结束时间、颜色、亮度及效果。
3. 点「导出给 IAG」，把 `.iagcue.json` 传到手机，在 IAG App 的「编排」页导入。

时间轴沿用 Resolve Cue v1 的单轨。新工程默认 60 fps，旧工程保留导入时的帧率。灯效预览以 60 fps 为目标，实际画面刷新随设备和浏览器变化。留白是黑场，工程草稿存于当前浏览器。重开草稿后可再选素材或粘贴网址。

## 时间轴编辑

- 「选择」模式拖灯效块中间可移动，重叠部分会被覆盖。拖左右边缘可修剪，修剪停在相邻灯效边界。
- 「波纹修剪」模式拖边缘，后面的灯效随时长变化移动。「刀片」模式点击灯效块即可分割。吸附开启时，移动和修剪靠近编辑点或播放头会对齐。编辑可撤销。
- 右上角选择快捷键套组，也可按 `Alt+Shift+1/2/3` 快速切换。表格里的 `Ctrl/Cmd` 在 Windows 用 `Ctrl`，在 macOS 用 `Command`。

| 动作 | DaVinci Resolve | Premiere Pro | Final Cut Pro |
|---|---|---|---|
| 选择 / 波纹修剪 / 刀片 | `A` / `T` / `B` | `V` / `B` / `C` | `A` / `T` / `B` |
| 吸附 | `N` | `S` | `N` |
| 播放头处分割 | `Ctrl/Cmd+B` | `Ctrl/Cmd+K` | `Ctrl/Cmd+B` |
| 删除并留空 | `Backspace` | `Delete` | `Shift+Backspace` |
| 波纹删除 | `Delete` | `Shift+Delete` | `Backspace` |

空格播放或暂停，`J` 倒放灯效预览，`K` 暂停，`L` 正向播放。`J` 倒放时参考视频或音频保持暂停，停下时定位到播放头。左右方向键逐帧，上下方向键跳到相邻编辑点，`Enter` 选中播放头下的灯效。输入框可照常打字。可在工具栏切换工具并使用刀片完成分割。

[DaVinci Resolve 编辑指南](https://documents.blackmagicdesign.com/UserManuals/DaVinciResolveEditorsGuide.pdf) · [Premiere Pro 快捷键](https://helpx.adobe.com/premiere/desktop/get-started/keyboard-shortcuts/default-keyboard-shortcuts.html) · [Final Cut Pro 快捷键](https://support.apple.com/guide/final-cut-pro/ver90ba5929/mac)

## 实体灯棒监看

用支持网页蓝牙的 Chrome 或 Edge 打开 HTTPS 网页。打开电脑蓝牙并给灯棒开机，点击预览下方的「连接灯棒」，在浏览器列表选中 `EMB_` 开头的荧光棒。若灯棒已连到手机，先在手机 App 内断开。[浏览器蓝牙支持](https://developer.mozilla.org/zh-CN/docs/Web/API/Web_Bluetooth_API)

- 播放时灯棒跟随灯效。暂停时显示播放头位置的静态颜色，可以拖动定位或编辑颜色后立即查看。切出该标签页、播放到黑场和主动断开时会发送黑色。
- 呼吸和闪烁由灯棒执行原有灯效。渐变在同一灯效内按 100 毫秒间隔更新，网页画面继续以 60 fps 预览。灯棒连接和控制在本机完成。

## 在线视频

- 可直接播放的 HTTPS 视频直链（如 MP4、WebM）和允许嵌入的 YouTube 视频可跟随编排时间轴播放。视频是否可访问由源网站和浏览器决定。[YouTube 官方播放器接口](https://developers.google.com/youtube/iframe_api_reference)
- B 站支持包含 BV 号或 av 号的完整视频地址。`b23.tv` 短链接可以先打开，再复制地址栏展开的网址。[B 站外链播放器说明](https://player.bilibili.com/)
- 本地文件在浏览器内处理。导入网址时浏览器向对应源网站取视频，下载的 IAG 文件只含灯效和时间轴。

### B 站自动同步（桌面 Chrome／Edge／Firefox）

1. 点击「下载同步扩展」。Chrome 和 Edge 的网页安装指引提供 ZIP 和对应的扩展管理地址。Firefox 的扩展上架后可直接打开 Mozilla 安装页。
2. Chrome 和 Edge 下载 ZIP 后解压，在扩展管理页开启「开发者模式」，加载解压目录。Mozilla 安装页使用「添加到 Firefox」，重启后扩展继续可用。上架前的 Firefox 临时版可在 `about:debugging#/runtime/this-firefox` 载入 XPI。[Chrome 安装说明](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked) · [Edge 安装说明](https://learn.microsoft.com/microsoft-edge/extensions-chromium/getting-started/extension-sideloading) · [Firefox 临时安装说明](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Your_first_WebExtension#trying_it_out)
3. 刷新编排页，导入 B 站链接。在内嵌视频点播放，等到显示「B 站已自动同步」。在视频里播放、暂停、拖动进度，时间轴会跟随。也可用编排页的播放按钮及时间轴控制视频。

扩展只在编排页嵌入的 B 站播放器中交换播放状态、时间和时长。手动方式仍在视频下方，输入 `1:15` 等时间即可定位。

网页导出灯效工程。素材、指纹对齐与实体灯棒控制另由原有工具和手机 App 处理。可预览的媒体格式由浏览器决定。超过 24 MB 或 20 分钟的媒体仍可播放，波形略过。呼吸与闪烁画面是屏幕模拟，超出已有参数标定范围时显示静态颜色。iaglight 和 RRNN 可继续在手机 App 中导入。

## 本机打开

在此目录使用 Node.js 24。

```powershell
npm ci
npm run build
python scripts/package-extensions.py
npm run preview
```

打开 `http://127.0.0.1:4173/`。Windows 也可以在首次安装并构建后双击 `启动网页编排器.cmd`。

## GitHub Pages

将这个独立目录作为专用仓库的根目录。在仓库 `Settings → Pages` 将发布来源选为 `GitHub Actions`，随后运行 `Build and deploy GitHub Pages`。工作流只上传 `dist`，页面支持 `/<仓库名>/` 路径。部署地址会显示在工作流的 `github-pages` 环境中。[GitHub Pages 官方说明](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)

Mozilla 发布签名版后，将官方扩展详情页设为仓库 Actions 变量 `FIREFOX_AMO_URL`。下一次构建会让 Firefox 的下载入口直接跳转到该页。[Mozilla 上架流程](https://extensionworkshop.com/documentation/publish/submitting-an-add-on/)

构建产物包含第三方依赖的 `THIRD_PARTY_NOTICES.md`。

## 本地检查

```powershell
npm run lint
npm test
npm run build
npx playwright install chromium
npm run test:browser
```

已安装 Edge 的 Windows 可设置 `$env:IAG_BROWSER_CHANNEL = 'msedge'`，用 Edge 跑浏览器测试。测试从模拟 Pages 子目录加载生产构建。
