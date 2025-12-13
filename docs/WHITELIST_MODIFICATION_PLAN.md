# 白名单规则修改方案分析

**需求**: 只有在"小六"和"AI初老师"两个机器人都在的群聊里才需要@，在所有其他群聊里都不需要@而直接回复

**当前逻辑**: 白名单模式 - 指定群无需@，其他群需要@
**目标逻辑**: 黑名单模式 - 只有双机器人群需要@，其他所有群无需@

---

## 📋 需要修改的代码位置

### 1. **核心过滤逻辑** - `server/lib/feishu-client.js`

#### 位置 1.1: 构造函数 (第36-46行)
**当前代码**:
```javascript
// 无需@即可响应的群聊白名单（1-、2-、3-开头的群聊）
// 这些群聊中，任何用户消息都会触发机器人响应
this.noMentionRequiredChats = new Set([
  'oc_8623156bb41f217a3822aca12362b068',  // 1-市场活动 (/home/event)
  'oc_4a6d86d4fe64fba7300cd867611ad752',  // 2-案例库 (/home/case)
  'oc_3de30cbfdd18839ccc2b4566db8d8a24',  // 3-WebX (/home/webx)
  'oc_5d40b0cd98849b2c87ae950ec65e1de7',  // 会飞的CC (临时添加用于测试)
]);

console.log('[FeishuClient] No-mention-required chats:', this.noMentionRequiredChats.size);
```

**需要改为**:
```javascript
// ===== 新的黑名单模式 =====
// 需要@才能响应的群聊（只有双机器人群）
this.mentionRequiredChats = new Set([
  // 这里可以预先配置已知的双机器人群
  // 或者设为空，依赖运行时检测
]);

// 群成员缓存（用于检测是否为双机器人群）
// 格式: { chatId: { members: [...], lastUpdate: timestamp, hasBothBots: boolean } }
this.chatMemberCache = new Map();

// 缓存有效期（30分钟）
this.CACHE_EXPIRY = 30 * 60 * 1000;

// 双机器人的标识（根据name识别）
this.BOT_NAMES = {
  xiaoliu: '小六',
  aiteacher: 'AI初老师'
};

console.log('[FeishuClient] Mention required mode: Only groups with both bots require @');
```

---

#### 位置 1.2: isMessageForBot() 方法 (第200-260行)
**当前逻辑**:
```javascript
isMessageForBot(event) {
  // 1. 私聊 → true
  // 2. 群聊在白名单 → true
  // 3. 群聊不在白名单但有mentions → 检查是否@了机器人
  // 4. 群聊不在白名单且无mentions → false
}
```

**需要改为**:
```javascript
async isMessageForBot(event) {  // ⚠️ 改为 async
  const message = event.message;
  if (!message) {
    console.log('[FeishuClient] isMessageForBot: No message object, returning false');
    return false;
  }

  // 私聊 - 始终响应
  if (message.chat_type === 'p2p') {
    console.log('[FeishuClient] isMessageForBot: Private chat, returning true');
    return true;
  }

  // 群聊 - 新逻辑
  if (message.chat_type === 'group') {
    const chatId = message.chat_id;

    // ===== 核心改动：检查是否为双机器人群 =====
    const hasBothBots = await this.checkIfBothBotsInChat(chatId);

    if (hasBothBots) {
      // 双机器人群 - 需要@才响应
      console.log('[FeishuClient] isMessageForBot: Dual-bot group, checking mentions...');

      const mentions = message.mentions;
      if (!mentions || mentions.length === 0) {
        console.log('[FeishuClient] isMessageForBot: Dual-bot group but no mentions, returning false');
        return false;
      }

      // 检查是否@了小六
      if (this.botInfo?.open_id) {
        for (const mention of mentions) {
          if (mention.id?.open_id === this.botInfo.open_id) {
            console.log('[FeishuClient] isMessageForBot: Bot is mentioned in dual-bot group, returning true');
            return true;
          }
          if (mention.key === '@_all') {
            console.log('[FeishuClient] isMessageForBot: @_all in dual-bot group, returning true');
            return true;
          }
        }
        console.log('[FeishuClient] isMessageForBot: Bot not mentioned in dual-bot group, returning false');
        return false;
      } else {
        // 没有bot info，接受任何mention
        console.log('[FeishuClient] isMessageForBot: No bot open_id, accepting any mention in dual-bot group, returning true');
        return true;
      }

    } else {
      // 非双机器人群 - 无需@，直接响应
      console.log('[FeishuClient] isMessageForBot: Not a dual-bot group, returning true (no @ required)');
      return true;
    }
  }

  // 未知聊天类型
  console.log('[FeishuClient] isMessageForBot: Unknown chat type:', message.chat_type);
  return false;
}
```

---

#### 位置 1.3: 新增方法 - checkIfBothBotsInChat() (插入到第260行后)
**新增代码**:
```javascript
/**
 * 检查群聊中是否同时有"小六"和"AI初老师"两个机器人
 * 带缓存机制，避免频繁调用API
 *
 * @param {string} chatId - 群聊ID
 * @returns {Promise<boolean>} true=双机器人群，false=非双机器人群
 */
async checkIfBothBotsInChat(chatId) {
  try {
    // 1. 检查缓存
    const cached = this.chatMemberCache.get(chatId);
    const now = Date.now();

    if (cached && (now - cached.lastUpdate) < this.CACHE_EXPIRY) {
      console.log(`[FeishuClient] Using cached result for ${chatId}: hasBothBots=${cached.hasBothBots}`);
      return cached.hasBothBots;
    }

    // 2. 缓存过期或不存在，调用API获取成员列表
    console.log(`[FeishuClient] Cache miss/expired for ${chatId}, fetching members...`);
    const members = await this.getChatMembers(chatId);

    // 3. 检测是否同时存在两个机器人
    const botNames = members
      .filter(m => m.member_type === 'app')  // 只看机器人类型
      .map(m => m.name);

    console.log(`[FeishuClient] Found bots in ${chatId}:`, botNames);

    const hasXiaoliu = botNames.some(name => name && name.includes(this.BOT_NAMES.xiaoliu));
    const hasAITeacher = botNames.some(name => name && name.includes(this.BOT_NAMES.aiteacher));
    const hasBothBots = hasXiaoliu && hasAITeacher;

    console.log(`[FeishuClient] ${chatId} - 小六: ${hasXiaoliu}, AI初老师: ${hasAITeacher}, 双机器人: ${hasBothBots}`);

    // 4. 更新缓存
    this.chatMemberCache.set(chatId, {
      members,
      lastUpdate: now,
      hasBothBots
    });

    return hasBothBots;

  } catch (error) {
    console.error(`[FeishuClient] Failed to check bots in chat ${chatId}:`, error.message);

    // 出错时的降级策略：假设不是双机器人群（安全策略，避免漏回复）
    console.log(`[FeishuClient] Error fallback: treating ${chatId} as non-dual-bot group`);
    return false;
  }
}
```

---

#### 位置 1.4: 新增方法 - 手动刷新缓存 (可选，插入到上一个方法后)
```javascript
/**
 * 手动刷新群聊成员缓存（供维护使用）
 *
 * @param {string} chatId - 群聊ID，如果不传则清空所有缓存
 */
async refreshChatMemberCache(chatId = null) {
  if (chatId) {
    console.log(`[FeishuClient] Refreshing cache for chat: ${chatId}`);
    this.chatMemberCache.delete(chatId);
    await this.checkIfBothBotsInChat(chatId); // 重新获取
  } else {
    console.log('[FeishuClient] Clearing all chat member cache');
    this.chatMemberCache.clear();
  }
}
```

---

### 2. **调用方修改** - `server/feishu-ws.js`

#### 位置 2.1: handleMessageEvent 调用处 (大约第150-160行)
**当前代码**:
```javascript
// Check if this message is for the bot
if (!this.client.isMessageForBot(event)) {
  console.log('[FeishuClient] Message not for bot, skipping');
  return;
}
```

**需要改为**:
```javascript
// Check if this message is for the bot (现在是异步方法)
const isForBot = await this.client.isMessageForBot(event);
if (!isForBot) {
  console.log('[FeishuClient] Message not for bot, skipping');
  return;
}
```

⚠️ **重要**: 需要确保调用 `isMessageForBot()` 的函数是 `async` 函数

---

### 3. **配置文件/环境变量** (可选优化)

如果想让配置更灵活，可以添加环境变量：

#### 位置 3.1: .env 文件
```bash
# 双机器人检测配置
BOT_NAME_XIAOLIU=小六
BOT_NAME_AITEACHER=AI初老师
CHAT_MEMBER_CACHE_EXPIRY=1800000  # 30分钟，单位毫秒
```

#### 位置 3.2: feishu-client.js 构造函数
```javascript
// 从环境变量读取配置
this.BOT_NAMES = {
  xiaoliu: process.env.BOT_NAME_XIAOLIU || '小六',
  aiteacher: process.env.BOT_NAME_AITEACHER || 'AI初老师'
};
this.CACHE_EXPIRY = parseInt(process.env.CHAT_MEMBER_CACHE_EXPIRY) || (30 * 60 * 1000);
```

---

### 4. **注释和文档修改**

#### 位置 4.1: feishu-client.js 顶部注释 (第1-10行)
更新类说明，反映新的逻辑：
```javascript
/**
 * Feishu Client
 *
 * Encapsulates Lark SDK for WebSocket connection and message handling.
 * Uses long-lived WebSocket connection (no public domain needed).
 *
 * 消息过滤逻辑（黑名单模式）：
 * - 私聊：始终响应
 * - 群聊（双机器人）：需要@才响应
 * - 群聊（其他）：无需@，直接响应
 */
```

#### 位置 4.2: isMessageForBot() 方法注释 (第193-199行)
```javascript
/**
 * Check if a message is for the bot
 *
 * 新逻辑（黑名单模式）：
 * - Private chats: Always true
 * - Group chats with both "小六" and "AI初老师": Requires @mention
 * - All other group chats: Always true (no @ required)
 *
 * @param {Object} event - Feishu message event
 * @returns {Promise<boolean>} true if message should be handled
 */
```

---

## 🔄 数据流示意图

### 修改前（白名单模式）
```
消息到达
  ↓
私聊？ → YES → 响应
  ↓ NO
在白名单？ → YES → 响应
  ↓ NO
有@机器人？ → YES → 响应
  ↓ NO
忽略 ❌
```

### 修改后（黑名单模式）
```
消息到达
  ↓
私聊？ → YES → 响应
  ↓ NO
双机器人群？ → YES → 有@机器人？ → YES → 响应
  ↓ NO              ↓ NO
响应                忽略 ❌
```

---

## ⚠️ 注意事项

### 1. 性能考虑
- **API调用开销**: 首次检测需要调用 `getChatMembers()` API
- **缓存策略**: 30分钟缓存避免频繁API调用
- **建议**: 如果已知哪些群是双机器人，可以预先配置到 `mentionRequiredChats`

### 2. 边界情况
- **API调用失败**: 降级为"非双机器人群"（安全策略，避免漏回复）
- **机器人加入/退出**: 缓存30分钟后自动刷新
- **权限问题**: `getChatMembers()` 需要 `im:chat:member:list` 权限

### 3. 机器人识别
当前依赖 `getChatMembers()` 返回的：
1. `member_type === 'app'` (最可靠)
2. `user_type === 'app'` (备选)
3. `is_bot` / `is_app` 标志
4. `name` 包含"小六"或"AI初老师"（兜底方案）

### 4. 测试建议
修改后需要测试：
- [ ] 私聊 - 应该正常响应
- [ ] 只有小六的群 - 应该无需@即响应
- [ ] 小六+AI初老师的群 - 应该需要@才响应
- [ ] 其他群（无机器人或其他机器人组合）- 应该无需@即响应
- [ ] 缓存过期（31分钟后）- 应该重新检测

---

## 📝 修改清单

### 必须修改
- [x] `server/lib/feishu-client.js:36-46` - 构造函数，改为黑名单模式
- [x] `server/lib/feishu-client.js:200-260` - `isMessageForBot()` 改为异步+新逻辑
- [x] `server/lib/feishu-client.js:260后` - 新增 `checkIfBothBotsInChat()` 方法
- [x] `server/feishu-ws.js:~150` - 调用改为 `await isMessageForBot()`

### 可选修改
- [ ] `.env` - 添加配置项
- [ ] `server/lib/feishu-client.js` - 添加 `refreshChatMemberCache()` 方法
- [ ] 更新相关注释和文档

### 验证检查
- [ ] 确保所有调用 `isMessageForBot()` 的地方都改为 `await`
- [ ] 确保飞书应用有 `im:chat:member:list` 权限
- [ ] 测试所有群聊类型的响应行为
- [ ] 监控API调用频率和缓存命中率

---

## 🚀 推荐实施步骤

1. **备份当前代码**
   ```bash
   git commit -am "backup: before whitelist logic change"
   ```

2. **修改核心逻辑**
   - 先修改 `server/lib/feishu-client.js`
   - 添加新方法 `checkIfBothBotsInChat()`

3. **修改调用方**
   - 更新 `server/feishu-ws.js` 中的调用

4. **测试验证**
   - 重启服务：`pm2 restart feishu`
   - 在不同类型的群中测试

5. **观察日志**
   ```bash
   pm2 logs feishu --lines 100 | grep "dual-bot\|hasBothBots"
   ```

6. **根据需要调整**
   - 如果缓存命中率低，考虑增加缓存时间
   - 如果API调用失败率高，考虑预配置双机器人群

---

**总结**: 核心修改集中在 `server/lib/feishu-client.js` 的3个地方（构造函数、isMessageForBot、新增方法），以及 `server/feishu-ws.js` 的1个调用点。逻辑从"白名单"反转为"黑名单"，需要异步检测群成员。
