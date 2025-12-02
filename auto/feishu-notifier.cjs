#!/usr/bin/env node

/**
 * feishu-notifier.cjs - 飞书通知模块
 *
 * 功能：
 * 1. 发送自动化开发任务的状态通知
 * 2. 支持多种事件类型：开始、完成、失败、暂停、全部完成
 * 3. 格式化详细日志（包括代码diff、错误堆栈等）
 */

const fs = require('fs');
const path = require('path');

// 动态导入 ES module
let lark;
async function loadLark() {
  if (!lark) {
    lark = await import('@larksuiteoapi/node-sdk');
    lark = lark.default;
  }
  return lark;
}

class FeishuNotifier {
  constructor(config = {}) {
    // 优先使用系统环境变量
    this.appId = config.appId || process.env.FeishuCC_App_ID;
    this.appSecret = config.appSecret || process.env.FeishuCC_App_Secret;
    this.receiveId = config.receiveId || process.env.FEISHU_NOTIFY_RECEIVE_ID;

    // 自动检测接收者类型 (chat_id 或 open_id)
    if (this.receiveId) {
      this.receiveIdType = config.receiveIdType ||
                          (this.receiveId.startsWith('oc_') ? 'chat_id' : 'open_id');
    } else {
      this.receiveIdType = config.receiveIdType || 'open_id';
    }

    this.client = null;

    // 验证必需的环境变量
    if (!this.appId || !this.appSecret) {
      console.warn('[飞书通知] 警告: 未配置 FeishuCC_App_ID 或 FeishuCC_App_Secret 环境变量');
      console.warn('[飞书通知] 飞书通知功能将被禁用');
      this.enabled = false;
    } else if (!this.receiveId) {
      console.log('[飞书通知] 未配置接收者ID (FEISHU_NOTIFY_RECEIVE_ID)，通知功能已禁用');
      this.enabled = false;
    } else {
      this.enabled = true;
      console.log(`[飞书通知] 已启用，接收者: ${this.receiveId} (${this.receiveIdType})`);
    }
  }

  /**
   * 初始化 Lark 客户端
   */
  async init() {
    if (this.client) return;

    const larkModule = await loadLark();
    this.client = new larkModule.Client({
      appId: this.appId,
      appSecret: this.appSecret,
      domain: larkModule.Domain.Feishu
    });
  }

  /**
   * 发送消息
   */
  async sendMessage(content, msgType = 'text') {
    if (!this.enabled) {
      console.log('[飞书通知] 未配置接收者，跳过通知');
      return false;
    }

    try {
      await this.init();

      const res = await this.client.im.message.create({
        params: {
          receive_id_type: this.receiveIdType
        },
        data: {
          receive_id: this.receiveId,
          content: typeof content === 'string' ? content : JSON.stringify(content),
          msg_type: msgType
        }
      });

      if (res.code === 0) {
        console.log('[飞书通知] 消息发送成功:', res.data.message_id);
        return true;
      } else {
        console.error('[飞书通知] 发送失败:', res.code, res.msg);
        return false;
      }
    } catch (error) {
      console.error('[飞书通知] 发送异常:', error.message);
      return false;
    }
  }

  /**
   * 发送任务开始通知
   */
  async notifyTaskStart(task, state) {
    const content = {
      elements: [
        {
          tag: 'div',
          text: {
            tag: 'lark_md',
            content: `**⏰ 开始新任务**\n` +
              `📋 任务: ${task.title}\n` +
              `🔢 进度: ${state.currentTaskIndex + 1}/${state.tasks.length}\n` +
              `📊 阶段: ${task.stage}\n` +
              `🔁 重试: ${task.retryCount}/3\n` +
              `⏰ 时间: ${new Date().toLocaleString('zh-CN')}`
          }
        }
      ]
    };

    if (task.retryCount > 0) {
      content.elements.push({
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: `⚠️ **这是第 ${task.retryCount} 次重试**\n上次失败: ${task.lastError || '未知错误'}`
        }
      });
    }

    return this.sendMessage(content, 'interactive');
  }

  /**
   * 发送任务完成通知
   */
  async notifyTaskComplete(task, state, duration) {
    const progress = Math.round(((state.currentTaskIndex + 1) / state.tasks.length) * 100);
    const completedTasks = state.tasks.filter(t => t.status === 'completed').length;

    const content = {
      elements: [
        {
          tag: 'div',
          text: {
            tag: 'lark_md',
            content: `**✅ 任务完成**\n` +
              `📋 任务: ${task.title}\n` +
              `⏱️ 耗时: ${duration}秒\n` +
              `📊 总进度: ${completedTasks}/${state.tasks.length} (${progress}%)\n` +
              `⏰ 时间: ${new Date().toLocaleString('zh-CN')}`
          }
        }
      ]
    };

    return this.sendMessage(content, 'interactive');
  }

  /**
   * 发送任务失败通知
   */
  async notifyTaskFailed(task, state, error, output) {
    const content = {
      elements: [
        {
          tag: 'div',
          text: {
            tag: 'lark_md',
            content: `**❌ 任务失败**\n` +
              `📋 任务: ${task.title}\n` +
              `🔢 进度: ${state.currentTaskIndex + 1}/${state.tasks.length}\n` +
              `🔁 重试次数: ${task.retryCount}/3\n` +
              `⏰ 时间: ${new Date().toLocaleString('zh-CN')}`
          }
        },
        {
          tag: 'div',
          text: {
            tag: 'lark_md',
            content: `**错误信息**:\n\`\`\`\n${this.truncate(error, 500)}\n\`\`\``
          }
        }
      ]
    };

    // 如果有 Claude 输出摘要
    if (output) {
      content.elements.push({
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: `**Claude 输出摘要**:\n${this.truncate(output, 300)}`
        }
      });
    }

    return this.sendMessage(content, 'interactive');
  }

  /**
   * 发送暂停通知（3次重试后）
   */
  async notifyPaused(task, state) {
    const content = {
      elements: [
        {
          tag: 'div',
          text: {
            tag: 'lark_md',
            content: `**🛑 自动化已暂停**\n` +
              `📋 任务: ${task.title}\n` +
              `🔢 进度: ${state.currentTaskIndex + 1}/${state.tasks.length}\n` +
              `❌ 原因: 任务连续失败3次\n` +
              `⏰ 时间: ${new Date().toLocaleString('zh-CN')}`
          }
        },
        {
          tag: 'div',
          text: {
            tag: 'lark_md',
            content: `**失败历史**:\n${this.formatAttempts(task.attempts)}`
          }
        },
        {
          tag: 'div',
          text: {
            tag: 'lark_md',
            content: `**需要人工介入**\n` +
              `请检查日志目录: \`logs/\`\n` +
              `任务状态文件: \`task-state.json\`\n\n` +
              `修复后，任务将自动恢复。`
          }
        }
      ]
    };

    return this.sendMessage(content, 'interactive');
  }

  /**
   * 发送全部完成通知
   */
  async notifyAllComplete(state) {
    const totalTime = this.calculateTotalTime(state);
    const totalAttempts = state.totalAttempts;
    const avgRetriesPerTask = (totalAttempts / state.tasks.length).toFixed(2);

    const content = {
      elements: [
        {
          tag: 'div',
          text: {
            tag: 'lark_md',
            content: `**🎉 全部任务完成！**\n` +
              `✅ 已完成: ${state.tasks.length} 个任务\n` +
              `📊 总尝试: ${totalAttempts} 次\n` +
              `📈 平均重试: ${avgRetriesPerTask} 次/任务\n` +
              `⏱️ 总耗时: ${totalTime}\n` +
              `⏰ 完成时间: ${new Date().toLocaleString('zh-CN')}`
          }
        },
        {
          tag: 'div',
          text: {
            tag: 'lark_md',
            content: `**飞书机器人集成项目已完成！**\n\n` +
              `可以开始测试：\n` +
              `1. \`npm run feishu\` 启动服务\n` +
              `2. 飞书中给机器人发消息\n` +
              `3. 检查 Web UI 项目列表`
          }
        }
      ]
    };

    return this.sendMessage(content, 'interactive');
  }

  /**
   * 格式化尝试历史
   */
  formatAttempts(attempts) {
    return attempts.map((attempt, index) => {
      const status = attempt.success ? '✅' : '❌';
      const time = new Date(attempt.timestamp).toLocaleTimeString('zh-CN');
      const error = attempt.error ? `\n  错误: ${this.truncate(attempt.error, 100)}` : '';
      return `${index + 1}. ${status} ${time} (Level ${attempt.promptLevel})${error}`;
    }).join('\n');
  }

  /**
   * 计算总耗时
   */
  calculateTotalTime(state) {
    const completedTasks = state.tasks.filter(t => t.completedAt);
    if (completedTasks.length === 0) return '0分钟';

    const firstStart = new Date(state.tasks[0].attempts[0]?.timestamp);
    const lastComplete = new Date(Math.max(...completedTasks.map(t => new Date(t.completedAt))));

    const diffMs = lastComplete - firstStart;
    const diffMins = Math.round(diffMs / 60000);
    const hours = Math.floor(diffMins / 60);
    const mins = diffMins % 60;

    return hours > 0 ? `${hours}小时${mins}分钟` : `${mins}分钟`;
  }

  /**
   * 截断文本
   */
  truncate(text, maxLength) {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  }
}

// 命令行测试
if (require.main === module) {
  const notifier = new FeishuNotifier();

  if (!notifier.enabled) {
    console.error('❌ 未配置接收者ID，请设置环境变量: FEISHU_NOTIFY_RECEIVE_ID');
    console.log('\n示例: export FEISHU_NOTIFY_RECEIVE_ID=ou_xxxxx');
    process.exit(1);
  }

  // 测试发送
  (async () => {
    console.log('📤 发送测试消息...\n');

    const mockTask = {
      id: 'stage0-task0',
      title: '测试任务',
      stage: 0,
      retryCount: 0,
      attempts: []
    };

    const mockState = {
      currentTaskIndex: 0,
      tasks: [mockTask],
      totalAttempts: 0
    };

    await notifier.notifyTaskStart(mockTask, mockState);

    console.log('\n✅ 测试完成');
  })();
}

module.exports = FeishuNotifier;
