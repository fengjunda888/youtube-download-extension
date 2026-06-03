# YouTube yt-dlp Chrome Extension

目标：打开 YouTube 视频页，点 Chrome 扩展按钮，直接调用本机 `yt-dlp` 下载。

支持：

- 多个视频同时下载
- 下载进度、速度和 ETA
- 当前视频 / 整个合集选择
- 最佳 MP4、1080p、720p、480p、仅音频 MP3

默认下载目录：

```text
C:\Users\fengj\Desktop\冯俊达\youtube videos
```

## 一次性安装

1. Chrome 打开 `chrome://extensions/`。
2. 打开 `开发者模式`。
3. 点 `加载已解压的扩展程序`。
4. 选择 `extension` 文件夹。
5. 双击 `Install-NativeHost.bat`。
6. 重启 Chrome，回到 `chrome://extensions/` 点扩展的刷新按钮。

扩展使用固定 ID：

```text
lgdfehfacdnpknkphkfmmollklciaaal
```

安装后不需要保持 PowerShell 窗口打开。native host 会在点击扩展下载时由 Chrome 按需启动。

## 使用

打开 YouTube 视频页，点扩展图标，确认下载路径、画质和范围，点 `加入下载`。

下载日志保存在下载目录下的 `yt-dlp-logs` 文件夹。
