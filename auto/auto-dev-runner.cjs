#!/usr/bin/env node

/**
 * auto-dev-runner.cjs - 自动化开发核心调度器
 *
 * 功能：
 * 1. 加载任务状态
 * 2. 检查依赖关系
 * 3. 生成提示词
 * 4. 调用 Claude CLI
 * 5. 解析输出判断成功/失败
 * 6. 更新状态
 * 7. 发送飞书通知
 * 8. 决定下一步（继续/重试/暂停）
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const FeishuNotifier = require('./feishu-notifier.cjs');

const STATE_FILE = path.join(__dirname, 'task-state.json');
const LOGS_DIR = path.join(__dirname, 'logs');
const PROMPTS_DIR = path.join(__dirname, 'prompts');

class AutoDevRunner {
  constructor() {
    this.state = null;
    this.notifier = new FeishuNotifier();
  }

  /**
   * 加载任务状态
   */
  loadState() {
    if (!fs.existsSync(STATE_FILE)) {
      throw new Error('task-state.json 不存在，请先运行 node task-parser.cjs');
    }

    this.state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
    return this.state;
  }

  /**
   * 保存任务状态
   */
  saveState() {
    fs.writeFileSync(STATE_FILE, JSON.stringify(this.state, null, 2), 'utf-8');
  }

  /**
   * 获取当前任务
   */
  getCurrentTask() {
    if (this.state.globalStatus !== 'running') {
      return null;
    }

    const task = this.state.tasks[this.state.currentTaskIndex];
    if (!task || task.status === 'completed') {
      return null;
    }

    return task;
  }

  /**
   * 检查任务依赖是否满足
   */
  checkDependencies(task) {
    const unmetDeps = [];

    for (const depId of task.dependencies) {
      const depTask = this.state.tasks.find(t => t.id === depId);
      if (!depTask || depTask.status !== 'completed') {
        unmetDeps.push(depId);
      }
    }

    return unmetDeps;
  }

  /**
   * 生成提示词
   */
  async generatePrompt(task) {
    const promptLevel = Math.min(task.retryCount, 3);
    const promptFiles = [
      'level-0-friendly.txt',
      'level-1-retry.txt',
      'level-2-strict.txt',
      'level-3-pua.txt'
    ];

    const templatePath = path.join(PROMPTS_DIR, promptFiles[promptLevel]);
    let template = fs.readFileSync(templatePath, 'utf-8');

    // 替换变量
    const replacements = {
      '{{TASK_INDEX}}': this.state.currentTaskIndex + 1,
      '{{TOTAL_TASKS}}': this.state.tasks.length,
      '{{STAGE_NUMBER}}': task.stage,
      '{{TASK_ID}}': task.id,
      '{{TASK_TITLE}}': task.title,
      '{{TASK_DESCRIPTION}}': task.description || '无',
      '{{DEPENDENCIES_INFO}}': this.formatDependencies(task),
      '{{RETRY_COUNT}}': task.retryCount,
      '{{REMAINING_RETRIES}}': 3 - task.retryCount,
      '{{LAST_ERROR}}': task.lastError || '未知错误',
      '{{LAST_ATTEMPT_TIME}}': task.attempts[task.attempts.length - 1]?.timestamp || 'N/A',
      '{{ALL_ERRORS}}': this.formatAllErrors(task),
      '{{ERROR_1}}': task.attempts[0]?.error || 'N/A',
      '{{ERROR_2}}': task.attempts[1]?.error || 'N/A',
      '{{ERROR_3}}': task.attempts[2]?.error || 'N/A',
      '{{COMPLEXITY}}': this.calculateComplexity(task)
    };

    for (const [key, value] of Object.entries(replacements)) {
      template = template.replace(new RegExp(key, 'g'), String(value));
    }

    return template;
  }

  /**
   * 格式化依赖信息
   */
  formatDependencies(task) {
    if (task.dependencies.length === 0) {
      return '无依赖';
    }

    return task.dependencies.map(depId => {
      const depTask = this.state.tasks.find(t => t.id === depId);
      const status = depTask?.status === 'completed' ? '✅' : '❌';
      return `${status} ${depId}: ${depTask?.title || '未知'}`;
    }).join('\n');
  }

  /**
   * 格式化所有错误
   */
  formatAllErrors(task) {
    if (task.attempts.length === 0) {
      return '暂无失败记录';
    }

    return task.attempts
      .filter(a => !a.success)
      .map((a, i) => `第${i + 1}次 (Level ${a.promptLevel}): ${a.error}`)
      .join('\n');
  }

  /**
   * 计算任务复杂度（1-5星）
   */
  calculateComplexity(task) {
    // 简单启发式规则
    if (task.title.includes('测试') || task.title.includes('确认')) return 1;
    if (task.title.includes('创建') && task.title.includes('简单')) return 2;
    if (task.title.includes('实现') && task.stage <= 3) return 3;
    if (task.title.includes('集成') || task.title.includes('API')) return 4;
    return 3; // 默认中等难度
  }

  /**
   * 调用 Claude CLI
   */
  async runClaude(prompt) {
    const startTime = Date.now();
    const logFile = path.join(
      LOGS_DIR,
      `${new Date().toISOString().replace(/[:.]/g, '-')}.log`
    );

    // 确保 logs 目录存在
    if (!fs.existsSync(LOGS_DIR)) {
      fs.mkdirSync(LOGS_DIR, { recursive: true });
    }

    // 将提示词写入临时文件
    const promptFile = path.join(__dirname, '.tmp-prompt.txt');
    fs.writeFileSync(promptFile, prompt, 'utf-8');

    return new Promise((resolve) => {
      let output = '';
      let error = '';

      console.log('\n🚀 调用 Claude CLI...');
      console.log(`📝 日志文件: ${logFile}\n`);

      const claude = spawn('claude', [
        '--dangerously-skip-permissions',
        '-p', prompt
      ], {
        cwd: __dirname,
        env: { ...process.env, CLAUDE_CODE_CWD: __dirname },
        shell: true,
        timeout: 600000 // 10分钟超时
      });

      // 捕获输出
      claude.stdout.on('data', (data) => {
        const text = data.toString();
        output += text;
        process.stdout.write(text); // 实时显示
      });

      claude.stderr.on('data', (data) => {
        const text = data.toString();
        error += text;
        process.stderr.write(text);
      });

      claude.on('close', (code) => {
        const duration = Math.round((Date.now() - startTime) / 1000);

        // 写入日志文件
        const logContent = `
=================================================
Claude CLI 执行日志
=================================================
时间: ${new Date().toISOString()}
退出码: ${code}
耗时: ${duration}秒

--- STDOUT ---
${output}

--- STDERR ---
${error}

--- PROMPT ---
${prompt}
=================================================
`;
        fs.writeFileSync(logFile, logContent, 'utf-8');

        // 清理临时文件
        if (fs.existsSync(promptFile)) {
          fs.unlinkSync(promptFile);
        }

        resolve({
          success: code === 0,
          output,
          error,
          duration,
          logFile
        });
      });

      claude.on('error', (err) => {
        const duration = Math.round((Date.now() - startTime) / 1000);
        resolve({
          success: false,
          output,
          error: err.message,
          duration,
          logFile
        });
      });
    });
  }

  /**
   * 解析 Claude 输出，判断任务是否完成
   */
  parseClaudeOutput(output) {
    const outputLower = output.toLowerCase();

    // 检查成功标记
    if (output.includes('✅ TASK_COMPLETED') || output.includes('TASK_COMPLETED')) {
      return { success: true, error: null };
    }

    // 检查阻塞标记
    const blockedMatch = output.match(/⚠️\s*TASK_BLOCKED:\s*(.+)/i);
    if (blockedMatch) {
      return { success: false, error: `BLOCKED: ${blockedMatch[1].trim()}` };
    }

    // 检查明显的错误
    if (outputLower.includes('error:') || outputLower.includes('failed') || outputLower.includes('exception')) {
      const errorLines = output.split('\n').filter(line =>
        line.toLowerCase().includes('error') ||
        line.toLowerCase().includes('failed')
      );
      return {
        success: false,
        error: errorLines.slice(0, 3).join(' | ') || '未知错误'
      };
    }

    // 默认判断：如果没有明确标记，根据内容判断
    if (output.length < 100) {
      return { success: false, error: '输出过短，可能执行失败' };
    }

    // 如果输出很长且没有错误迹象，认为可能成功（但建议明确标记）
    return {
      success: false,
      error: '未找到明确的完成标记，请确认任务是否真正完成'
    };
  }

  /**
   * 记录任务尝试
   */
  recordAttempt(task, result, promptLevel) {
    const attempt = {
      timestamp: new Date().toISOString(),
      promptLevel,
      success: result.success,
      error: result.error || null,
      output: result.output.substring(0, 500), // 保存前500字符
      duration: result.duration
    };

    task.attempts.push(attempt);
    this.state.totalAttempts++;

    if (result.success) {
      task.status = 'completed';
      task.completedAt = new Date().toISOString();
    } else {
      task.retryCount++;
      task.lastError = result.error;

      if (task.retryCount >= 3) {
        task.status = 'blocked';
        this.state.globalStatus = 'paused';
        this.state.pauseReason = `任务 ${task.id} 连续失败3次`;
      } else {
        task.status = 'in_progress';
      }
    }

    return attempt;
  }

  /**
   * 推进到下一个任务
   */
  advanceToNextTask() {
    const nextIndex = this.state.currentTaskIndex + 1;

    if (nextIndex >= this.state.tasks.length) {
      // 所有任务完成
      this.state.globalStatus = 'completed';
      this.state.currentTaskIndex = this.state.tasks.length - 1;
      return false;
    }

    this.state.currentTaskIndex = nextIndex;
    return true;
  }

  /**
   * 主执行流程
   */
  async run() {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🤖 飞书集成自动化开发系统');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // 1. 加载状态
    console.log('📂 加载任务状态...');
    this.loadState();
    this.state.lastRun = new Date().toISOString();

    console.log(`   状态: ${this.state.globalStatus}`);
    console.log(`   进度: ${this.state.currentTaskIndex + 1}/${this.state.tasks.length}\n`);

    // 2. 检查全局状态
    if (this.state.globalStatus === 'paused') {
      console.log('⏸️  系统已暂停，原因:', this.state.pauseReason);
      console.log('   请人工检查并修复问题，然后将 globalStatus 改为 running\n');
      return { status: 'paused', reason: this.state.pauseReason };
    }

    if (this.state.globalStatus === 'completed') {
      console.log('🎉 所有任务已完成！\n');
      return { status: 'completed' };
    }

    // 3. 获取当前任务
    const task = this.getCurrentTask();
    if (!task) {
      console.log('✅ 当前没有待执行任务\n');
      return { status: 'no_task' };
    }

    console.log(`🎯 当前任务: ${task.title}`);
    console.log(`   ID: ${task.id}`);
    console.log(`   阶段: ${task.stage}`);
    console.log(`   重试: ${task.retryCount}/3\n`);

    // 4. 检查依赖
    const unmetDeps = this.checkDependencies(task);
    if (unmetDeps.length > 0) {
      console.log('⚠️  依赖未满足:', unmetDeps.join(', '));
      console.log('   跳过当前任务\n');
      return { status: 'dependency_not_met', dependencies: unmetDeps };
    }

    // 5. 发送开始通知
    await this.notifier.notifyTaskStart(task, this.state);

    // 6. 生成提示词
    console.log(`📝 生成提示词 (Level ${Math.min(task.retryCount, 3)})...`);
    const prompt = await this.generatePrompt(task);

    // 7. 调用 Claude
    const result = await this.runClaude(prompt);

    // 8. 解析输出
    const parsed = this.parseClaudeOutput(result.output);
    result.success = parsed.success;
    result.error = parsed.error || result.error;

    console.log(`\n${'='.repeat(50)}`);
    console.log(`执行结果: ${result.success ? '✅ 成功' : '❌ 失败'}`);
    console.log(`耗时: ${result.duration}秒`);
    if (!result.success) {
      console.log(`错误: ${result.error}`);
    }
    console.log(`${'='.repeat(50)}\n`);

    // 9. 记录尝试
    const promptLevel = Math.min(task.retryCount, 3);
    this.recordAttempt(task, result, promptLevel);

    // 10. 发送通知
    if (result.success) {
      await this.notifier.notifyTaskComplete(task, this.state, result.duration);

      // 推进到下一个任务
      const hasNext = this.advanceToNextTask();
      if (!hasNext) {
        await this.notifier.notifyAllComplete(this.state);
      }
    } else {
      await this.notifier.notifyTaskFailed(task, this.state, result.error, result.output);

      if (task.status === 'blocked') {
        await this.notifier.notifyPaused(task, this.state);
      }
    }

    // 11. 保存状态
    this.saveState();

    return {
      status: result.success ? 'success' : 'failed',
      task: task.id,
      duration: result.duration,
      retryCount: task.retryCount
    };
  }
}

// 命令行执行
if (require.main === module) {
  const runner = new AutoDevRunner();

  runner.run()
    .then(result => {
      console.log('📊 执行结果:', JSON.stringify(result, null, 2));
      process.exit(result.status === 'paused' ? 2 : 0);
    })
    .catch(error => {
      console.error('💥 执行异常:', error.message);
      console.error(error.stack);
      process.exit(1);
    });
}

module.exports = AutoDevRunner;
