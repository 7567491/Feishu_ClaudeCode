/**
 * 任务执行器 - 复用父目录的 auto-dev-runner
 */

const fs = require('fs');
const path = require('path');

class TaskExecutor {
  constructor() {
    // 加载父目录的 AutoDevRunner
    const parentDir = path.resolve(__dirname, '../../');
    this.AutoDevRunner = require(path.join(parentDir, 'auto-dev-runner.cjs'));
    this.stateFile = path.join(parentDir, 'task-state.json');
  }

  /**
   * 执行单个任务
   */
  async executeTask(job) {
    const { taskId, taskIndex, retryLevel } = job.data;

    console.log(`\n${'='.repeat(60)}`);
    console.log(`🚀 开始执行任务`);
    console.log(`   任务ID: ${taskId}`);
    console.log(`   索引: ${taskIndex}`);
    console.log(`   重试级别: ${retryLevel}`);
    console.log(`   Job ID: ${job.id}`);
    console.log(`${'='.repeat(60)}\n`);

    const runner = new this.AutoDevRunner();

    try {
      // 1. 加载状态
      await job.progress(10);
      runner.loadState();

      // 2. 获取任务
      await job.progress(20);
      const task = runner.state.tasks[taskIndex];

      if (!task) {
        throw new Error(`任务不存在: index ${taskIndex}`);
      }

      console.log(`📋 任务信息:`);
      console.log(`   标题: ${task.title}`);
      console.log(`   阶段: ${task.stage}`);
      console.log(`   状态: ${task.status}`);
      console.log(`   重试次数: ${task.retryCount}\n`);

      // 3. 检查依赖
      await job.progress(30);
      const unmetDeps = runner.checkDependencies(task);

      if (unmetDeps.length > 0) {
        throw new Error(`依赖未满足: ${unmetDeps.join(', ')}`);
      }

      // 4. 生成提示词
      await job.progress(40);
      console.log('📝 生成提示词...');
      const prompt = await runner.generatePrompt(task);

      // 5. 执行 Claude
      await job.progress(50);
      console.log('🤖 调用 Claude CLI...\n');
      const result = await runner.runClaude(prompt);

      // 6. 解析结果
      await job.progress(80);
      const parsed = runner.parseClaudeOutput(result.output);
      result.success = parsed.success;
      result.error = parsed.error || result.error;

      console.log(`\n${'='.repeat(60)}`);
      console.log(`执行结果: ${result.success ? '✅ 成功' : '❌ 失败'}`);
      console.log(`耗时: ${result.duration}秒`);
      if (!result.success) {
        console.log(`错误: ${result.error}`);
      }
      console.log(`${'='.repeat(60)}\n`);

      // 7. 记录尝试
      await job.progress(90);
      const promptLevel = Math.min(task.retryCount, 3);
      runner.recordAttempt(task, result, promptLevel);

      // 8. 发送通知
      if (result.success) {
        await runner.notifier.notifyTaskComplete(task, runner.state, result.duration);
        runner.advanceToNextTask();
      } else {
        await runner.notifier.notifyTaskFailed(task, runner.state, result.error, result.output);

        if (task.status === 'blocked') {
          await runner.notifier.notifyPaused(task, runner.state);
        }
      }

      // 9. 保存状态
      runner.saveState();
      await job.progress(100);

      // 10. 返回结果
      return {
        success: result.success,
        taskId: task.id,
        taskTitle: task.title,
        duration: result.duration,
        output: result.output.substring(0, 500),
        nextTaskIndex: runner.state.currentTaskIndex
      };

    } catch (error) {
      console.error('\n💥 执行异常:', error.message);
      console.error(error.stack);
      throw error; // Bull 会自动处理重试
    }
  }

  /**
   * 获取当前任务状态
   */
  getTaskState() {
    if (!fs.existsSync(this.stateFile)) {
      throw new Error('task-state.json 不存在');
    }

    return JSON.parse(fs.readFileSync(this.stateFile, 'utf-8'));
  }

  /**
   * 获取下一个待执行任务
   */
  getNextTask() {
    const state = this.getTaskState();

    if (state.globalStatus === 'paused') {
      return { status: 'paused', reason: state.pauseReason };
    }

    if (state.globalStatus === 'completed') {
      return { status: 'completed' };
    }

    const currentTask = state.tasks[state.currentTaskIndex];

    if (!currentTask || currentTask.status === 'completed') {
      return { status: 'no_task' };
    }

    return {
      status: 'ready',
      task: currentTask,
      index: state.currentTaskIndex
    };
  }
}

module.exports = TaskExecutor;
