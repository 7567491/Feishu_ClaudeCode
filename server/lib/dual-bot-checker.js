/**
 * 双机器人群检测器
 *
 * 通过分别查询两个机器人（小六、AI初老师）所在的群列表，
 * 计算交集得到双机器人群，用于判断是否需要 @mention 才响应。
 */

import lark from '@larksuiteoapi/node-sdk';

class DualBotChecker {
  constructor() {
    // 双机器人群 Set（chat_id）
    this.dualBotGroups = new Set();

    // 小六所在的群
    this.xiaoliuGroups = new Set();

    // AI初老师所在的群
    this.teacherGroups = new Set();

    // 上次刷新时间
    this.lastRefresh = null;

    // 刷新间隔：30分钟
    this.REFRESH_INTERVAL = 30 * 60 * 1000;

    // 是否已初始化
    this.initialized = false;

    // 客户端
    this.xiaoliuClient = null;
    this.teacherClient = null;
  }

  /**
   * 初始化检测器
   */
  async initialize() {
    const xiaoliuAppId = process.env.FeishuCC_App_ID;
    const xiaoliuAppSecret = process.env.FeishuCC_App_Secret;
    const teacherAppId = process.env.Feishu_Teacher_App_ID;
    const teacherAppSecret = process.env.Feishu_Teacher_App_Secret;

    if (!xiaoliuAppId || !xiaoliuAppSecret) {
      console.warn('[DualBotChecker] ⚠️ 小六凭据未配置，无法初始化');
      return false;
    }

    if (!teacherAppId || !teacherAppSecret) {
      console.warn('[DualBotChecker] ⚠️ AI初老师凭据未配置，将假设所有群为单机器人');
      // 即使没有AI初老师凭据，也可以工作（假设没有双机器人群）
      this.initialized = true;
      return true;
    }

    // 创建飞书客户端
    this.xiaoliuClient = new lark.Client({
      appId: xiaoliuAppId,
      appSecret: xiaoliuAppSecret,
      domain: lark.Domain.Feishu
    });

    this.teacherClient = new lark.Client({
      appId: teacherAppId,
      appSecret: teacherAppSecret,
      domain: lark.Domain.Feishu
    });

    // 首次加载
    await this.refresh();

    // 设置定时刷新
    setInterval(() => {
      this.refresh().catch(err => {
        console.error('[DualBotChecker] 定时刷新失败:', err.message);
      });
    }, this.REFRESH_INTERVAL);

    this.initialized = true;
    console.log('[DualBotChecker] ✅ 初始化完成，定时刷新间隔:', this.REFRESH_INTERVAL / 1000, '秒');
    return true;
  }

  /**
   * 获取机器人所在的所有群
   */
  async getBotGroups(client, botName) {
    const groups = new Set();
    let pageToken = null;
    let hasMore = true;

    try {
      while (hasMore) {
        const params = { page_size: 100 };
        if (pageToken) params.page_token = pageToken;

        const res = await client.im.chat.list({ params });

        if (res.code === 0) {
          const items = res.data?.items || [];
          items.forEach(chat => groups.add(chat.chat_id));

          hasMore = res.data?.has_more || false;
          pageToken = res.data?.page_token || null;
        } else {
          console.error(`[DualBotChecker] ${botName} chat.list 失败:`, res.msg);
          break;
        }
      }
    } catch (error) {
      console.error(`[DualBotChecker] 获取 ${botName} 群列表失败:`, error.message);
    }

    return groups;
  }

  /**
   * 刷新双机器人群列表
   */
  async refresh() {
    console.log('[DualBotChecker] 🔄 开始刷新双机器人群列表...');
    const startTime = Date.now();

    try {
      // 并行获取两个机器人的群列表
      const [xiaoliuGroups, teacherGroups] = await Promise.all([
        this.xiaoliuClient ? this.getBotGroups(this.xiaoliuClient, '小六') : new Set(),
        this.teacherClient ? this.getBotGroups(this.teacherClient, 'AI初老师') : new Set()
      ]);

      this.xiaoliuGroups = xiaoliuGroups;
      this.teacherGroups = teacherGroups;

      // 计算交集
      const dualBotGroups = new Set();
      for (const chatId of xiaoliuGroups) {
        if (teacherGroups.has(chatId)) {
          dualBotGroups.add(chatId);
        }
      }

      this.dualBotGroups = dualBotGroups;
      this.lastRefresh = new Date();

      const elapsed = Date.now() - startTime;
      console.log(`[DualBotChecker] ✅ 刷新完成 (${elapsed}ms)`);
      console.log(`  小六群数: ${xiaoliuGroups.size}`);
      console.log(`  AI初老师群数: ${teacherGroups.size}`);
      console.log(`  双机器人群数: ${dualBotGroups.size}`);

      return true;
    } catch (error) {
      console.error('[DualBotChecker] ❌ 刷新失败:', error.message);
      return false;
    }
  }

  /**
   * 检查群是否为双机器人群
   * @param {string} chatId - 群聊 ID
   * @returns {boolean} true=双机器人群（需要@），false=单机器人群（无需@）
   */
  isDualBotGroup(chatId) {
    if (!this.initialized) {
      console.warn('[DualBotChecker] 未初始化，默认返回 false（无需@）');
      return false;
    }
    return this.dualBotGroups.has(chatId);
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      initialized: this.initialized,
      lastRefresh: this.lastRefresh,
      xiaoliuGroupCount: this.xiaoliuGroups.size,
      teacherGroupCount: this.teacherGroups.size,
      dualBotGroupCount: this.dualBotGroups.size,
      dualBotGroups: Array.from(this.dualBotGroups)
    };
  }

  /**
   * 手动添加双机器人群（用于测试或临时覆盖）
   */
  addDualBotGroup(chatId) {
    this.dualBotGroups.add(chatId);
    console.log(`[DualBotChecker] 手动添加双机器人群: ${chatId}`);
  }

  /**
   * 手动移除双机器人群
   */
  removeDualBotGroup(chatId) {
    this.dualBotGroups.delete(chatId);
    console.log(`[DualBotChecker] 手动移除双机器人群: ${chatId}`);
  }
}

// 单例模式
const dualBotChecker = new DualBotChecker();

export { dualBotChecker, DualBotChecker };
export default dualBotChecker;
