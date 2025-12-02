#!/usr/bin/env node

/**
 * task-parser.js - 解析 task.md 并生成初始 task-state.json
 *
 * 功能：
 * 1. 解析 markdown 格式的任务列表
 * 2. 识别阶段和任务依赖关系
 * 3. 生成符合 schema 的状态文件
 */

const fs = require('fs');
const path = require('path');

class TaskParser {
  constructor(taskMdPath) {
    this.taskMdPath = taskMdPath;
    this.tasks = [];
    this.currentStage = null;
  }

  /**
   * 解析 task.md 文件
   */
  parse() {
    const content = fs.readFileSync(this.taskMdPath, 'utf-8');
    const lines = content.split('\n');

    let taskIndexInStage = 0;

    for (const line of lines) {
      // 匹配阶段标题：## 阶段 0: 准备 (10分钟)
      const stageMatch = line.match(/^##\s+阶段\s+(\d+):\s*(.+?)(?:\s*\((.+?)\))?$/);
      if (stageMatch) {
        this.currentStage = {
          number: parseInt(stageMatch[1]),
          title: stageMatch[2].trim(),
          estimatedTime: stageMatch[3] || null
        };
        taskIndexInStage = 0;
        continue;
      }

      // 匹配任务：- [ ] 任务描述
      const taskMatch = line.match(/^-\s+\[([x\s])\]\s+(.+)$/);
      if (taskMatch && this.currentStage !== null) {
        const isCompleted = taskMatch[1] === 'x';
        const taskTitle = taskMatch[2].trim();

        // 解析子任务（缩进的任务）
        const isSubtask = line.match(/^\s{2,}-/);

        const task = {
          id: `stage${this.currentStage.number}-task${taskIndexInStage}`,
          stage: this.currentStage.number,
          title: taskTitle,
          description: '',
          status: isCompleted ? 'completed' : 'pending',
          retryCount: 0,
          dependencies: this.buildDependencies(this.currentStage.number, taskIndexInStage),
          attempts: [],
          lastError: null,
          completedAt: isCompleted ? new Date().toISOString() : null,
          verificationScript: this.inferVerificationScript(taskTitle)
        };

        this.tasks.push(task);
        taskIndexInStage++;
      }
    }

    return this.tasks;
  }

  /**
   * 构建任务依赖关系
   * 规则：
   * 1. 每个阶段的第一个任务依赖上一阶段的所有任务
   * 2. 阶段内的任务依赖同阶段前面的任务
   */
  buildDependencies(stage, taskIndex) {
    const dependencies = [];

    if (taskIndex === 0 && stage > 0) {
      // 当前阶段的第一个任务依赖上一阶段的所有任务
      const previousStageTasks = this.tasks.filter(t => t.stage === stage - 1);
      dependencies.push(...previousStageTasks.map(t => t.id));
    } else if (taskIndex > 0) {
      // 阶段内任务依赖前一个任务
      const previousTask = this.tasks.find(t =>
        t.stage === stage && t.id === `stage${stage}-task${taskIndex - 1}`
      );
      if (previousTask) {
        dependencies.push(previousTask.id);
      }
    }

    return dependencies;
  }

  /**
   * 根据任务标题推断验证脚本
   */
  inferVerificationScript(title) {
    // 可以根据关键词匹配验证脚本
    if (title.includes('测试') || title.includes('test')) {
      return 'npm test';
    }
    if (title.includes('启动') || title.includes('start')) {
      return null; // 启动任务不需要验证
    }
    return null;
  }

  /**
   * 生成初始 task-state.json
   */
  generateInitialState() {
    const tasks = this.parse();

    // 找到第一个未完成的任务
    const firstPendingIndex = tasks.findIndex(t => t.status === 'pending');

    const state = {
      version: '1.0.0',
      globalStatus: firstPendingIndex === -1 ? 'completed' : 'running',
      pauseReason: null,
      currentTaskIndex: firstPendingIndex === -1 ? tasks.length - 1 : firstPendingIndex,
      lastRun: null,
      totalAttempts: 0,
      tasks: tasks
    };

    return state;
  }

  /**
   * 保存状态到文件
   */
  saveState(outputPath) {
    const state = this.generateInitialState();
    fs.writeFileSync(outputPath, JSON.stringify(state, null, 2), 'utf-8');
    console.log(`✅ 已生成 task-state.json，共 ${state.tasks.length} 个任务`);
    console.log(`📍 当前任务索引: ${state.currentTaskIndex}`);
    console.log(`📊 状态: ${state.globalStatus}`);
    return state;
  }
}

// 命令行使用
if (require.main === module) {
  const taskMdPath = path.join(__dirname, 'task.md');
  const outputPath = path.join(__dirname, 'task-state.json');

  if (!fs.existsSync(taskMdPath)) {
    console.error('❌ task.md 文件不存在');
    process.exit(1);
  }

  const parser = new TaskParser(taskMdPath);
  const state = parser.saveState(outputPath);

  // 打印统计信息
  console.log('\n📈 统计信息:');
  const stageGroups = {};
  state.tasks.forEach(task => {
    if (!stageGroups[task.stage]) {
      stageGroups[task.stage] = { total: 0, completed: 0 };
    }
    stageGroups[task.stage].total++;
    if (task.status === 'completed') {
      stageGroups[task.stage].completed++;
    }
  });

  Object.keys(stageGroups).sort().forEach(stage => {
    const { total, completed } = stageGroups[stage];
    console.log(`  阶段 ${stage}: ${completed}/${total} 完成`);
  });
}

module.exports = TaskParser;
