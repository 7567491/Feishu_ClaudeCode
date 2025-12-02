/**
 * 自动调度器 - 定期检查并添加任务
 */

const queueManager = require('./queue-manager');
const TaskExecutor = require('./task-executor');
const queueConfig = require('../config/queue');

class Scheduler {
  constructor() {
    this.executor = new TaskExecutor();
    this.timer = null;
    this.running = false;
  }

  /**
   * 启动调度器
   */
  start() {
    if (this.running) {
      console.log('⚠️  调度器已在运行');
      return;
    }

    if (!queueConfig.scheduler.enabled) {
      console.log('⚠️  调度器未启用');
      return;
    }

    console.log('🕐 启动自动调度器...');
    console.log(`   检查间隔: ${queueConfig.scheduler.checkInterval / 60000}分钟\n`);

    this.running = true;

    // 立即执行一次
    this.scheduleNext();

    // 定期检查
    this.timer = setInterval(() => {
      this.scheduleNext();
    }, queueConfig.scheduler.checkInterval);

    console.log('✅ 调度器已启动\n');
  }

  /**
   * 停止调度器
   */
  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    this.running = false;
    console.log('⏹️  调度器已停止');
  }

  /**
   * 调度下一个任务
   */
  async scheduleNext() {
    try {
      console.log('\n⏰ [定时检查] 检查待执行任务...');

      const nextTask = this.executor.getNextTask();

      switch (nextTask.status) {
        case 'paused':
          console.log(`⏸️  系统已暂停: ${nextTask.reason}`);
          break;

        case 'completed':
          console.log('🎉 所有任务已完成！');
          break;

        case 'no_task':
          console.log('✅ 当前没有待执行任务');
          break;

        case 'ready':
          await this.addTaskToQueue(nextTask.task, nextTask.index);
          break;

        default:
          console.log('❓ 未知状态:', nextTask.status);
      }

    } catch (error) {
      console.error('❌ 调度失败:', error.message);
    }
  }

  /**
   * 添加任务到队列
   */
  async addTaskToQueue(task, taskIndex) {
    console.log(`📋 发现待执行任务: ${task.title}`);

    // 检查队列中是否已有该任务
    const queue = queueManager.getQueue();
    const activeJobs = await queue.getActive();
    const waitingJobs = await queue.getWaiting();

    const existingJob = [...activeJobs, ...waitingJobs].find(
      job => job.data.taskId === task.id
    );

    if (existingJob) {
      console.log(`⚠️  任务已在队列中: ${existingJob.id}`);
      return;
    }

    // 添加任务
    const priority = this.calculatePriority(task);
    const delay = this.calculateDelay(task);

    const job = await queueManager.addJob('execute-task', {
      taskId: task.id,
      taskIndex: taskIndex,
      retryLevel: task.retryCount
    }, {
      jobId: `task-${task.id}-${Date.now()}`,
      priority: priority,
      delay: delay
    });

    console.log(`✅ 任务已加入队列: ${job.id}`);
    if (delay > 0) {
      console.log(`   延迟执行: ${delay / 1000}秒`);
    }
  }

  /**
   * 计算任务优先级
   */
  calculatePriority(task) {
    // 阶段越早，优先级越高（数字越小越优先）
    const stagePriority = task.stage * 100;
    const taskNumber = parseInt(task.id.split('task')[1]) || 0;

    return stagePriority + taskNumber;
  }

  /**
   * 计算延迟时间
   */
  calculateDelay(task) {
    // 如果是重试，使用指数退避
    if (task.retryCount > 0) {
      return Math.pow(2, task.retryCount) * 60000; // 1分钟, 2分钟, 4分钟
    }
    return 0;
  }
}

module.exports = Scheduler;
