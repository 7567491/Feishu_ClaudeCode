# 在 Linux 上用 Wine 跑微信（mac 远程控制）

在无 GPU 的 Linux 服务器上用 Wine 运行 Windows 版微信，并通过 VNC/NoVNC 从 mac 远程控制。

## 主机前提
- 服务器：8C/16G，空闲约 114G，可覆盖 Wine+微信需求（磁盘预留 3–5G，含桌面/VNC 内存约 1–1.5G）。
- 系统：以 Debian/Ubuntu 为例，其他发行版请调整包名。

## 安装 Wine 与微信
1) 安装 Wine 与字体（示例）：
   `sudo dpkg --add-architecture i386`
   `sudo apt update && sudo apt install -y wine64 wine32 ttf-mscorefonts-installer winbind cabextract`
2) 从腾讯官网下载官方 Windows 安装包 WeChatSetup.exe。
3) 在 Wine 下运行安装：`wine WeChatSetup.exe` 按界面完成安装。

## 轻量桌面与 VNC
1) 安装 XFCE 和 VNC：
   `sudo apt install -y xfce4 xfce4-goodies tigervnc-standalone-server`
2) 创建 `~/.vnc/xstartup`：
   ```
   #!/bin/sh
   startxfce4 &
   ```
   并执行 `chmod +x ~/.vnc/xstartup`。
3) 启动 VNC（显示 :1 => 端口 5901）：`vncserver :1 -geometry 1280x800 -depth 24`
4) 可选 NoVNC（浏览器访问）：
   `sudo apt install -y novnc websockify && websockify --web /usr/share/novnc 6080 localhost:5901`
   在 mac 打开 `http://server_ip:6080/vnc.html`。

## 启动与使用微信
- 从 mac 用 VNC 客户端连接 `server_ip:5901`，或用浏览器访问 NoVNC。
- 启动微信：`wine "C:\\Program Files\\Tencent\\WeChat\\WeChat.exe"`，用手机扫码登录（算 PC 端，可与一台手机端同时在线）。
- 如需走本机 mitmproxy 抓包：在 XFCE 网络代理里设置 `http://127.0.0.1:8080`（或 `wechat-spider/config.yaml` 中端口），并导入信任 mitmproxy 证书。

## 安全与运维
- VNC/NoVNC 不要裸露公网；用安全组/IP 白名单或 SSH 隧道（`ssh -L 5901:localhost:5901 user@server`）。
- 避免在服务器存放敏感聊天/文件；为 VNC 设置强密码。
- 如需省资源，可降低 VNC 分辨率/色深，并仅保留微信运行。