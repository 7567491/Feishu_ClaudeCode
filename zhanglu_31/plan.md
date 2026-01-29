# 开发计划（张璐任务待办清单）

## 任务列表（[ ]未完成 / [x]已完成）
- [x] 梳理需求与架构，补全 need/design/plan 文档
- [x] 初始化 Flask 项目结构，接入CORS与JSON存储
- [x] 实现任务 CRUD + 统计接口，并做文件锁与备份
- [x] 完成单页前端、移动端样式和基本交互
- [x] 端口登记：运行时从57001起挑选空闲端口并写入 `/home/ccp/teacher/port.csv`（当前 57004）
- [ ] Nginx 配置 `https://s.linapp.fun/zhanglu_renwudaibanqingdan.html` 路由与 `/api/tasks` 代理
- [ ] 部署自测：启动后端、访问HTML、验证接口与静态页均可用
- [x] 记录最新端口、部署步骤和访问结果到 README
- [ ] 回归检查：异常输入/并发写入/移动端展示
