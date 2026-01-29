# 架构设计文档（张璐任务待办清单）

## 总体
单页HTML + Flask API + JSON，Nginx 提供页面与反代。启动时按 `/home/ccp/teacher/port.csv` 从57001起选可用端口并登记。

## 前端
- 纯HTML/CSS/JS内联。
- 区块：顶部统计、输入区、状态Tab、任务列表（倒序，完成标记）。
- 交互：圆圈勾选切换、删除；移动端流式。

## 后端
- Flask + CORS。
- 端口：读取 `port.csv`；如已有本应用且端口空闲则复用，否则自57001起跳过已记录或占用端口，找到空闲端口后追加 `port,app_name,user,created_at`。
- API：`GET/POST /api/tasks`、`PUT/DELETE /api/tasks/<id>`、`GET /api/tasks/stats`。
- 数据模型：id、title、description、priority(high|medium|low)、status(pending|completed)、created_at、completed_at、updated_at。
- 持久化：`data/tasks.json`，读写加fcntl锁，写前备份到 `data/backups/`，标题必填。

## 运维
- 静态页：`/zhanglu_renwudaibanqingdan.html`（/mnt/www）。
- 代理：`/api/tasks` 指向运行端口，需与 port.csv 同步。
- HTTPS：`https://s.linapp.fun/zhanglu_renwudaibanqingdan.html`。
- 进程：PM2 守护 `python3 app.py`。

## 扩展
可追加分类、提醒、导入导出、多用户鉴权。
