/**
 * Bull 队列管理器
 */

const Queue = require('bull');
const path = require('path');
const redisConfig = require('../config/redis');
const queueConfig = require('../config/queue');

class QueueManager {
  constructor() {
    this.queue = null;
    this.initialized = false;
  }

  /**
   * 初始化队列
   */
  init() {
    if (this.initialized) {
      return this.queue;
    }

    console.log('📦 初始化 Bull 队列...');

    this.queue = new Queue(queueConfig.queueName, {
      redis: redisConfig,
      defaultJobOptions: queueConfig.defaultJobOptions
    });

    // 注册全局事件监听
    this.registerGlobalEvents();

    this.initialized = true;
    console.log('✅ Bull 队列初始化完成');

    return this.queue;
  }

  /**
   * 获取队列实例
   */
  getQueue() {
    if (!this.initialized) {
      this.init();
    }
    return this.queue;
  }

  /**
   * 添加任务
   */
  async addJob(jobName, data, options = {}) {
    const queue = this.getQueue();

    const jobOptions = {
      ...queueConfig.defaultJobOptions,
      ...options
    };

    const job = await queue.add(jobName, data, jobOptions);

    console.log(`✅ 任务已添加: ${job.id}`);
    console.log(`   类型: ${jobName}`);
    console.log(`   数据: ${JSON.stringify(data, null, 2)}`);

    return job;
  }

  /**
   * 获取队列统计信息
   */
  async getStats() {
    const queue = this.getQueue();

    const [waiting, active, completed, failed, delayed, paused] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
      queue.getPausedCount()
    ]);

    return {
      waiting,
      active,
      completed,
      failed,
      delayed,
      paused,
      total: waiting + active + completed + failed + delayed + paused
    };
  }

  /**
   * 清理队列
   */
  async clean(grace = 86400000, status = 'completed') {
    const queue = this.getQueue();

    console.log(`🧹 清理队列: ${status} (${grace}ms 之前)`);

    const jobs = await queue.clean(grace, status);

    console.log(`✅ 已清理 ${jobs.length} 个任务`);

    return jobs;
  }

  /**
   * 暂停队列
   */
  async pause() {
    const queue = this.getQueue();
    await queue.pause();
    console.log('⏸️  队列已暂停');
  }

  /**
   * 恢复队列
   */
  async resume() {
    const queue = this.getQueue();
    await queue.resume();
    console.log('▶️  队列已恢复');
  }

  /**
   * 注册全局事件监听
   */
  registerGlobalEvents() {
    const queue = this.queue;

    queue.on('error', (error) => {
      console.error('❌ [Queue Error]', error);
    });

    queue.on('waiting', (jobId) => {
      console.log(`⏳ [Waiting] Job ${jobId}`);
    });

    queue.on('active', (job) => {
      console.log(`🏃 [Active] Job ${job.id} - ${job.name}`);
    });

    queue.on('stalled', (job) => {
      console.warn(`⚠️  [Stalled] Job ${job.id} 卡住了`);
    });

    queue.on('progress', (job, progress) => {
      console.log(`📊 [Progress] Job ${job.id} - ${progress}%`);
    });

    queue.on('completed', (job, result) => {
      console.log(`✅ [Completed] Job ${job.id}`);
      if (result) {
        console.log(`   结果: ${JSON.stringify(result, null, 2)}`);
      }
    });

    queue.on('failed', (job, err) => {
      console.error(`❌ [Failed] Job ${job.id}`);
      console.error(`   错误: ${err.message}`);
      console.error(`   尝试: ${job.attemptsMade}/${job.opts.attempts}`);
    });

    queue.on('paused', () => {
      console.log('⏸️  [Paused] 队列已暂停');
    });

    queue.on('resumed', () => {
      console.log('▶️  [Resumed] 队列已恢复');
    });

    queue.on('cleaned', (jobs, type) => {
      console.log(`🧹 [Cleaned] 清理了 ${jobs.length} 个 ${type} 任务`);
    });

    queue.on('drained', () => {
      console.log('🏁 [Drained] 队列已清空');
    });
  }

  /**
   * 关闭队列
   */
  async close() {
    if (this.queue) {
      await this.queue.close();
      console.log('👋 队列已关闭');
    }
  }
}

// 单例模式
const queueManager = new QueueManager();

module.exports = queueManager;
