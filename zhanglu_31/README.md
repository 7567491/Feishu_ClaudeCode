# 张璐的任务待办清单

## 功能
- 单页HTML；顶部统计、输入区、状态筛选Tab、任务列表（倒序、完成标记）。
- 新增/删除/状态切换，优先级高/中/低，支持手机端。

## 快速运行
```bash
cd /home/ccp/zhanglu_31
python3 app.py  # 自动写入 /home/ccp/teacher/port.csv
# pm2 start ecosystem.config.cjs
```
接口：`/api/tasks`（GET/POST），`/api/tasks/<id>`（PUT/DELETE），`/api/tasks/stats`。

## 端口与存储
- 端口从57001起递增查找并写表，当前：57004 -> zhanglu_31_tasks_json。
- 数据：`data/tasks.json`（写前备份到 `data/backups/`，文件锁防并发）。
- CORS开启，文本输出转义。

## Nginx/HTTPS
- 静态页：`/zhanglu_renwudaibanqingdan.html` -> `/mnt/www`。
- 代理：`/api/tasks` -> `http://localhost:57004`（端口变更需同步）。
- 域名：`https://s.linapp.fun/zhanglu_renwudaibanqingdan.html`，当前访问返回Nginx 404，需上架静态文件并重载Nginx。

## 注意
- 禁用 pm2 restart/stop/delete/kill/start 等命令，可用 `pm2 status|logs` 查看。
- JSON结构兼容；异常统一JSON返回并打印日志。
