# 服务器端口分配表

> 更新时间: 2025-12-04

## 1. 核心服务

| 域名 | 端口 | 服务类型 | 进程 | 说明 |
|------|------|---------|------|------|
| cc.linapp.fun | 33300 | Node.js | node | Claude Code UI 主服务 |
| ccode.linapp.fun | 33300 | Node.js | node | Claude Code UI (备用域名) |
| ccui.linapp.fun | 33300 | Node.js | node | Claude Code UI (备用域名) |
| teacher.linapp.fun | 33301 | Python Flask | python3 | AI初老师机器人 |
| cclog.linapp.fun | 33080 | - | - | 日志服务 |

## 2. Nginx 监听端口

| 端口 | 协议 | 说明 |
|------|------|------|
| 80 | HTTP | 所有站点HTTP入口 |
| 443 | HTTPS | SSL加密入口 |
| 55556 | HTTP | Claude API代理 |

## 3. 用户应用服务 (AI初老师生成)

| 域名 | 端口 | 用户 | 应用名称 | 进程 |
|------|------|------|---------|------|
| s.linapp.fun | 57001 | 张璐 | 简易日历 | python3 |
| ZL_33.linapp.fun | 57002 | 张璐 | ZL_33应用 | python3 |
| - | 57003 | - | - | python3 |
| - | 57004 | - | - | python3 |
| ZL_33.linapp.fun | 57005 | 张璐 | ZL_33应用 | python3 |
| USER_31.linapp.fun | 57006 | USER_31 | 用户应用 | python3 |
| ZL_32.linapp.fun | 57007 | 张璐 | 简易博客 | python3 |
| aizhichu_31.linapp.fun | 57008 | aizhichu | 任务待办清单 | python3 |
| xiaoliu-libing_31.linapp.fun | 57009 | libing | 小六应用 | python3 |
| laoniudeaikaifa_31.linapp.fun | 57010 | 老牛 | 任务待办清单 | python3 |
| s.linapp.fun/api | 57011 | 张璐 | 日历API | python3 |
| - | 57013 | 张璐 | todolist_31 | python3 |
| - | 57014 | 张璐 | 任务待办(新) | python3 |
| - | 57016 | ou_136... | todolist | python3 |
| s.linapp.fun | 57017 | 张璐 | 日历_33 | python3 |

## 4. 业务应用服务

| 域名 | 端口 | 服务类型 | 进程 | 说明 |
|------|------|---------|------|------|
| ah.linapp.fun | 29888 | FastAPI | python3 | A股分析器 |
| az.linapp.fun | 5001 | Flask | gunicorn | 云AZ可视化 |
| ao.linapp.fun | 7492 | Flask | gunicorn | 邮件应用 |
| chat.linapp.fun | 33334 | Python | python3 | 聊天服务 |
| speak.linapp.fun | 38888 | FastAPI | uvicorn | 语音服务 |
| meet.linapp.fun | 8000 | Python | python3 | 会议服务 |
| research.linapp.fun | 60521 | Python | python3 | GPT研究员 |
| storm.linapp.fun | 64778 | Streamlit | streamlit | Storm应用 |
| pdf.linapp.fun | 8888 | Python | pdf2zh | PDF翻译 |
| stock.linapp.fun | 19888 | - | - | 股票服务 |
| pick.linapp.fun | 13000 | - | - | 图片选择 |
| pr.linapp.fun | 38002 | FastAPI | uvicorn | PR服务 |
| search.linapp.fun | 38001 | - | - | 搜索服务 |
| prom.linapp.fun | 62380 | - | - | Prometheus |
| vote.linapp.fun | 10001 | - | - | 投票服务 |
| news.linapp.fun | 65432 | - | - | 新闻服务 |

## 5. 开发工具服务

| 域名 | 端口 | 服务类型 | 进程 | 说明 |
|------|------|---------|------|------|
| n8n.linapp.fun | 45678 | N8N | - | 自动化工作流 |
| note.linapp.fun | 60606 | Docker | docker-proxy | 笔记服务 |
| sd.linapp.fun | 7860 | Python | - | Stable Diffusion |
| vnc.linapp.fun | 6080 | WebSocket | websockify | VNC远程桌面 |
| go.linapp.fun | 7890 | GoAccess | - | 日志分析 |
| run.linapp.fun | 11666 | Python | gunicorn | 运行服务 |
| s3.linapp.fun | 15080 | Node.js | node | S3服务 |
| ha.linapp.fun | 11111 | - | - | HA服务 |

## 6. 游戏/娱乐应用

| 域名 | 端口 | 说明 |
|------|------|------|
| fk.linapp.fun | - | 俄罗斯方块 (静态) |
| wzq.linapp.fun | - | 五子棋 (静态) |
| xq.linapp.fun | - | 中国象棋 (静态) |
| zhanglu_saolei.linapp.fun | - | 扫雷 (静态) |
| zhanglu_wuziqi.linapp.fun | - | 五子棋 (静态) |

## 7. 其他系统服务

| 端口 | 服务 | 进程 | 说明 |
|------|------|------|------|
| 22 | SSH | sshd | 远程登录 |
| 3306 | MySQL | mysqld | 数据库 |
| 33060 | MySQL X | mysqld | MySQL X协议 |
| 6379 | Redis | redis-server | 缓存 |
| 7490 | PostgreSQL | postgres | 数据库 |
| 9002 | Docker | docker-proxy | 容器服务 |
| 631 | CUPS | cupsd | 打印服务 |
| 5901 | VNC | Xtigervnc | 远程桌面 |

## 8. PM2 进程管理

| ID | 名称 | PID | 状态 | 内存 | 运行时间 |
|----|------|-----|------|------|---------|
| 8 | ai-teacher | 52797 | online | 86.6MB | 37h |
| 11 | claude-code-ui | 593584 | online | 31.1MB | 30h |
| 15 | feishu | 721543 | online | 30.1MB | 29h |
| 16 | gpt-researcher | 2042648 | online | 119.0MB | 12h |
| 12 | vite-frontend | 3130451 | online | 62.3MB | 运行中 |
| 9 | zhanglu-todolist | 2451963 | online | 25.1MB | 7h |
| 17 | zhanglu_33_calendar | 3003722 | online | 27.2MB | 80m |

## 9. 静态文件托管

| 域名 | 根目录 | 说明 |
|------|--------|------|
| 7.linapp.fun | /var/www/magnificent-seven | 项目主页 |
| s.linapp.fun | /mnt/www | 静态应用托管 |
| lib-lei.linapp.fun | /mnt/www | 静态资源 |
| dianbo.linapp.fun | /var/www/dianbo.linapp.fun | 点播服务 |
| coach.linapp.fun | /var/www/html/coach | 教练页面 |

---

## 常用命令

```bash
# 查看端口占用
sudo ss -tlnp | grep :端口号

# 查看nginx配置
sudo nginx -T | grep server_name

# PM2管理
pm2 status
pm2 logs 服务名

# 重启nginx
sudo nginx -s reload
```
