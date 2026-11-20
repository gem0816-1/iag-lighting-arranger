# IAG 灯光编排网页

[打开在线编排器](https://gem0816-1.github.io/iag-lighting-arranger/)

1. 打开网页，选一段本地音频或视频，也可以点「导入网址」。已有的 Resolve `.iagcue.json` 可以直接打开。
2. 播放或点击时间轴定位，再点「添加灯效」。拖动灯效可移动，选中后可改开始和结束时间、颜色、亮度及效果。
3. 点「导出给 IAG」，把 `.iagcue.json` 传到手机，在 IAG App 的「编排」页导入。

时间轴沿用 Resolve Cue v1 的单轨与帧精度。留白是黑场，灯效之间可以相接。工程草稿存于当前浏览器，重新打开草稿后可再选素材或粘贴网址。空工程载入有时长的媒体后会调整时间轴，已有灯效的工程可在设置中调整总时长。

## 在线视频

- 可直接播放的 HTTPS 视频直链（如 MP4、WebM）和允许嵌入的 YouTube 视频可跟随编排时间轴播放。视频是否可访问由源网站和浏览器决定。[YouTube 官方播放器接口](https://developers.google.com/youtube/iframe_api_reference)
- B 站支持包含 BV 号或 av 号的完整视频地址。在内嵌视频里暂停，把画面上的时间填进「视频时间」并点「定位时间轴」。例如 `1:15` 会将编辑位置移动到 75 秒。`b23.tv` 短链接可以先打开，再复制地址栏展开的网址。[B 站外链播放器说明](https://player.bilibili.com/)
- 本地文件在浏览器内处理。导入网址时浏览器向对应源网站取视频，下载的 IAG 文件只含灯效和时间轴。

网页导出灯效工程。素材、指纹对齐与实体灯棒控制另由原有工具和手机 App 处理。可预览的媒体格式由浏览器决定。超过 24 MB 或 20 分钟的媒体仍可播放，波形略过。呼吸与闪烁画面是屏幕模拟，超出已有参数标定范围时显示静态颜色。iaglight 和 RRNN 可继续在手机 App 中导入。

## 本机打开

在此目录使用 Node.js 24。

```powershell
npm ci
npm run build
npm run preview
```

打开 `http://127.0.0.1:4173/`。Windows 也可以在首次安装并构建后双击 `启动网页编排器.cmd`。

## GitHub Pages

将这个独立目录作为专用仓库的根目录。在仓库 `Settings → Pages` 将发布来源选为 `GitHub Actions`，随后运行 `Build and deploy GitHub Pages`。工作流只上传 `dist`，页面支持 `/<仓库名>/` 路径。部署地址会显示在工作流的 `github-pages` 环境中。[GitHub Pages 官方说明](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)

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
