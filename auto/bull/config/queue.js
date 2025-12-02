/**
 * Bull 队列配置
 */

module.exports = {
  // 队列名称
  queueName: 'feishu-auto-dev',

  // 默认任务选项
  defaultJobOptions: {
    attempts: 3,                    // 最大重试次数
    backoff: {
      type: 'exponential',          // 指数退避
      delay: 60000                  // 首次延迟1分钟
    },
    timeout: 600000,                // 10分钟超时
    removeOnComplete: 100,          // 保留最近100个完成任务
    removeOnFail: false,            // 失败任务保留
    priority: 1                     // 默认优先级
  },

  // Worker 配置
  workerOptions: {
    concurrency: 1,                 // 并发数（建议1，避免任务冲突）
    maxStalledCount: 2,             // 最大卡住次数
    stalledInterval: 30000,         // 卡住检查间隔（30秒）
    lockDuration: 600000,           // 锁定时长（10分钟）
    lockRenewTime: 300000           // 锁更新时间（5分钟）
  },

  // 调度配置
  scheduler: {
    checkInterval: 600000,          // 检查间隔（10分钟）
    enabled: true                   // 是否启用自动调度
  }
};
