#!/bin/bash

# 飞书代码冲突重构脚本
# 功能：清理重复代码，修复不一致问题

echo "========================================="
echo "飞书代码冲突重构工具 v1.0"
echo "========================================="

# 1. 备份原始文件
echo "[1/5] 备份原始文件..."
BACKUP_DIR="/home/ccp/backups/refactor_$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

cp -r /home/ccp/server/feishu-webhook.js "$BACKUP_DIR/"
cp -r /home/ccp/server/feishu-ws.js "$BACKUP_DIR/"
cp -r /home/ccp/server/routes/feishu-proxy.js "$BACKUP_DIR/"
echo "✅ 备份完成: $BACKUP_DIR"

# 2. 修复消息类型不一致问题
echo "[2/5] 修复消息类型不一致..."
sed -i "s/'proxy'/'text'/g" /home/ccp/server/routes/feishu-proxy.js
echo "✅ 已将 feishu-proxy.js 中的 'proxy' 类型改为 'text'"

# 3. 创建共享模块目录
echo "[3/5] 创建共享模块..."
mkdir -p /home/ccp/server/lib/feishu-shared

# 4. 创建统一的消息处理模块
cat > /home/ccp/server/lib/feishu-shared/message-handler.js << 'EOF'
/**
 * 统一的飞书消息处理模块
 * 解决代码重复问题
 */

const FeishuFileHandler = require('../feishu-file-handler');
const feishuDb = require('../../database/db');

class MessageHandler {
  /**
   * 处理文件转换命令
   */
  static async handleFileConvert(client, chatId, projectPath, userText, sessionId) {
    const convertCommand = FeishuFileHandler.parseConvertCommand(userText);
    if (!convertCommand || convertCommand.command !== 'convert') {
      return false;
    }

    try {
      await FeishuFileHandler.handleFileConvert(
        client,
        chatId,
        projectPath,
        convertCommand.fileName
      );

      feishuDb.logMessage(sessionId, 'outgoing', 'file', `convert:${convertCommand.fileName}`, null);
      feishuDb.updateSessionActivity(sessionId);

      return { success: true };
    } catch (error) {
      await client.sendTextMessage(chatId, `❌ 转化失败: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * 处理文件发送命令
   */
  static async handleFileSend(client, chatId, projectPath, userText, sessionId) {
    const fileCommand = FeishuFileHandler.parseFileCommand(userText);
    if (!fileCommand || fileCommand.command !== 'send') {
      return false;
    }

    try {
      await FeishuFileHandler.handleFileSend(
        client,
        chatId,
        projectPath,
        fileCommand.fileName
      );

      feishuDb.logMessage(sessionId, 'outgoing', 'file', fileCommand.fileName, null);
      feishuDb.updateSessionActivity(sessionId);

      return { success: true };
    } catch (error) {
      await client.sendTextMessage(chatId, `❌ 发送失败: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * 记录消息日志
   */
  static logMessage(sessionId, direction, messageType, content, messageId = null) {
    feishuDb.logMessage(sessionId, direction, messageType, content, messageId);
    if (direction === 'outgoing') {
      feishuDb.updateSessionActivity(sessionId);
    }
  }
}

module.exports = MessageHandler;
EOF

echo "✅ 创建消息处理模块完成"

# 5. 创建统一的配置管理模块
cat > /home/ccp/server/lib/feishu-shared/config-loader.js << 'EOF'
/**
 * 统一的配置加载模块
 * 解决凭证初始化重复问题
 */

const credentialsDb = require('../../database/credentials');

class ConfigLoader {
  /**
   * 加载飞书凭证
   */
  static loadFeishuCredentials(userId = 'default') {
    const credentialValue = credentialsDb.getActiveCredential(userId, 'feishu');

    if (credentialValue) {
      const credentials = JSON.parse(credentialValue);
      return {
        appId: credentials.appId,
        appSecret: credentials.appSecret
      };
    }

    return {
      appId: process.env.FeishuCC_App_ID,
      appSecret: process.env.FeishuCC_App_Secret
    };
  }

  /**
   * 获取配置项
   */
  static getConfig(key, defaultValue = null) {
    return process.env[key] || defaultValue;
  }
}

module.exports = ConfigLoader;
EOF

echo "✅ 创建配置管理模块完成"

# 6. 创建数据访问层（DAL）
cat > /home/ccp/server/lib/feishu-shared/data-access.js << 'EOF'
/**
 * 数据访问层（DAL）
 * 统一管理数据库操作
 */

const feishuDb = require('../../database/db');

class DataAccess {
  // 会话相关操作
  static getSession(sessionId) {
    return feishuDb.getSession(sessionId);
  }

  static createSession(data) {
    return feishuDb.createSession(data);
  }

  static updateSession(sessionId, data) {
    return feishuDb.updateSession(sessionId, data);
  }

  // 消息日志操作
  static logMessage(sessionId, direction, messageType, content, messageId = null) {
    feishuDb.logMessage(sessionId, direction, messageType, content, messageId);
    if (direction === 'outgoing') {
      feishuDb.updateSessionActivity(sessionId);
    }
  }

  // 统计操作
  static getStatistics(timeRange = '24h') {
    return feishuDb.getStatistics(timeRange);
  }

  // 批量操作（带事务）
  static async batchOperation(operations) {
    const results = [];
    try {
      for (const op of operations) {
        const result = await op();
        results.push(result);
      }
      return { success: true, results };
    } catch (error) {
      console.error('Batch operation failed:', error);
      // 这里可以加入回滚逻辑
      return { success: false, error: error.message };
    }
  }
}

module.exports = DataAccess;
EOF

echo "✅ 创建数据访问层完成"

echo ""
echo "========================================="
echo "重构完成！"
echo "========================================="
echo ""
echo "📝 改动内容："
echo "1. ✅ 修复了消息类型不一致问题"
echo "2. ✅ 创建了统一的消息处理模块"
echo "3. ✅ 创建了配置管理模块"
echo "4. ✅ 创建了数据访问层"
echo ""
echo "⚠️  下一步操作："
echo "1. 修改 webhook.js, ws.js, proxy.js 使用新模块"
echo "2. 运行测试确保功能正常"
echo "3. 删除重复代码"
echo ""
echo "备份位置: $BACKUP_DIR"