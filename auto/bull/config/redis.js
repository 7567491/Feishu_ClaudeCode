/**
 * Redis 配置
 */

module.exports = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || undefined,
  db: parseInt(process.env.REDIS_DB || '0'),

  // 连接配置
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,

  // 重连策略
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000);
    return delay;
  }
};
