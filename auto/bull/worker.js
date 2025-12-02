#!/usr/bin/env node

/**
 * Bull Worker - 任务处理进程
 */

require('dotenv').config();

const queueManager = require('./lib/queue-manager');
const TaskExecutor = require('./lib/task-executor');
const Scheduler = require('./lib/scheduler');
const queueConfig = require('./config/queue');

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🤖 Bull Worker - 飞书自动化任务处理器');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// 初始化队列
const queue = queueManager.init();
const executor = new TaskExecutor();
const scheduler = new Scheduler();

// ==================== 注册任务处理器 ====================
console.log('📝 注册任务处理器...');

queue.process(
  'execute-task',
  queueConfig.workerOptions.concurrency,
  async (job) => {
    return await executor.executeTask(job);
  }
);

console.log(`✅ 任务处理器已注册 (并发数: ${queueConfig.workerOptions.concurrency})\n`);

// ==================== 事件监听 ====================
queue.on('completed', async (job, result) => {
  console.log(`\n✅ [任务完成]`);
  console.log(`   Job ID: ${job.id}`);
  console.log(`   任务: ${result.taskTitle}`);
  console.log(`   耗时: ${result.duration}秒`);

  // 如果成功，触发调度下一个任务
  if (result.success) {
    console.log('   下一个任务索引:', result.nextTaskIndex);

    // 延迟1秒后调度下一个任务
    setTimeout(() => {
      scheduler.scheduleNext();
    }, 1000);
  }
});

queue.on('failed', async (job, err) => {
  console.log(`\n❌ [任务失败]`);
  console.log(`   Job ID: ${job.id}`);
  console.log(`   错误: ${err.message}`);
  console.log(`   尝试: ${job.attemptsMade}/${job.opts.attempts}`);

  // 如果达到最大重试次数
  if (job.attemptsMade >= job.opts.attempts) {
    console.log(`   ⚠️  已达到最大重试次数，任务将被标记为 blocked`);
  } else {
    console.log(`   🔄 将在 ${Math.pow(2, job.attemptsMade)} 分钟后重试`);
  }
});

// ==================== 启动调度器 ====================
scheduler.start();

// ==================== 优雅关闭 ====================
const gracefulShutdown = async () => {
  console.log('\n\n👋 收到关闭信号，正在优雅关闭...');

  // 1. 停止调度器
  scheduler.stop();

  // 2. 暂停队列（不再接受新任务）
  await queue.pause();
  console.log('⏸️  队列已暂停');

  // 3. 等待当前任务完成
  const activeJobs = await queue.getActive();
  if (activeJobs.length > 0) {
    console.log(`⏳ 等待 ${activeJobs.length} 个活跃任务完成...`);

    // 最多等待30秒
    await Promise.race([
      queue.whenCurrentJobsFinished(),
      new Promise(resolve => setTimeout(resolve, 30000))
    ]);
  }

  // 4. 关闭队列连接
  await queueManager.close();

  console.log('✅ 关闭完成');
  process.exit(0);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// ==================== 错误处理 ====================
process.on('uncaughtException', (error) => {
  console.error('💥 未捕获的异常:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 未处理的 Promise 拒绝:', reason);
  process.exit(1);
});

console.log('🚀 Worker 已启动，等待任务...\n');
console.log('提示:');
console.log('  - 按 Ctrl+C 优雅关闭');
console.log('  - 查看日志: pm2 logs bull-worker');
console.log('  - 监控面板: http://bull.linapp.fun\n');
