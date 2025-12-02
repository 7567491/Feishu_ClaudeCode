/**
 * 飞书文档编辑功能集成补丁
 * 将此代码添加到 feishu-webhook.js 的消息处理部分
 */

// 在文件顶部引入编辑器模块
import { FeishuDocEditor } from './lib/feishu-doc-editor.js';

// 在初始化部分创建编辑器实例（在 initializeFeishuWebhook 函数中）
let docEditor = null;

// 在 initializeFeishuWebhook 函数中初始化编辑器
async function initializeDocEditor() {
  const database = feishuDb.getDatabase(); // 获取数据库实例
  docEditor = new FeishuDocEditor(feishuClient, database);

  // 恢复之前的编辑会话（服务重启时）
  await docEditor.restoreSessions();

  console.log('[FeishuWebhook] Document editor initialized');
}

// 在 handleMessageEvent 函数中，在文件命令处理之后添加编辑命令处理
// 插入位置：在第449行之后，Claude查询之前

/**
 * 处理编辑命令的代码片段
 * 将此代码插入到 handleMessageEvent 函数中
 */
async function handleEditCommands(userText, chatId, session) {
  // 检查是否为编辑命令
  const editCommand = docEditor.parseEditCommand(userText);

  if (!editCommand) {
    return false; // 不是编辑命令
  }

  console.log('[FeishuWebhook] Edit command detected:', editCommand);

  try {
    switch (editCommand.command) {
      case 'edit':
        // 查找文件
        const filePath = FeishuFileHandler.findFile(
          session.project_path,
          editCommand.fileName
        );

        if (!filePath) {
          await sendMessage(chatId, `❌ 找不到文件：${editCommand.fileName}`);
          return true;
        }

        // 启动编辑会话
        const result = await docEditor.startEditSession(
          chatId,
          filePath,
          session.user_id
        );

        await sendMessage(chatId, result.message);

        // 记录日志
        if (result.success) {
          feishuDb.logMessage(
            session.id,
            'outgoing',
            'edit',
            `edit:${editCommand.fileName}:${result.sessionId}`,
            null
          );
        }
        break;

      case 'stop_edit':
        // 查找该聊天的活跃编辑会话
        const activeSession = docEditor.findActiveSessionByChatId(chatId);

        if (!activeSession) {
          await sendMessage(chatId, '❌ 当前没有活跃的编辑会话');
          return true;
        }

        // 停止编辑会话
        const stopResult = await docEditor.stopEditSession(activeSession.sessionId);
        await sendMessage(chatId, stopResult.message);

        // 记录日志
        feishuDb.logMessage(
          session.id,
          'outgoing',
          'edit',
          `stop_edit:${activeSession.sessionId}`,
          null
        );
        break;

      case 'edit_status':
        // 获取编辑状态
        const statusMessage = await docEditor.getEditStatus(chatId);
        await sendMessage(chatId, statusMessage);

        // 记录日志
        feishuDb.logMessage(
          session.id,
          'outgoing',
          'edit',
          'edit_status',
          null
        );
        break;

      default:
        return false;
    }

    // 更新会话活动时间
    feishuDb.updateSessionActivity(session.id);
    return true; // 成功处理编辑命令

  } catch (error) {
    console.error('[FeishuWebhook] Failed to handle edit command:', error);
    await sendMessage(chatId, `❌ 编辑命令处理失败：${error.message}`);
    return true; // 虽然失败，但已经处理了命令
  }
}

/**
 * 完整的集成示例
 *
 * 在 handleMessageEvent 函数中，第449行之后添加：
 *
 * // Check if this is an edit command
 * const editHandled = await handleEditCommands(userText, chatId, session);
 * if (editHandled) {
 *   return;
 * }
 */

// 导出给测试使用
export { initializeDocEditor, handleEditCommands };