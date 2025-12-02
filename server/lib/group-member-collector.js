/**
 * 群成员信息收集器
 * 
 * 由于飞书API的getChatMembers可能受权限限制，
 * 这个模块从消息事件中收集用户信息作为补充
 */

import { feishuDb } from '../database/db.js';

export class GroupMemberCollector {
  /**
   * 从消息事件中提取并保存发送者信息
   * @param {Object} event - 飞书消息事件
   */
  static async collectFromMessageEvent(event) {
    try {
      const message = event.message;
      const sender = event.sender;

      if (!message || !sender) {
        return;
      }

      // 只处理群聊消息
      if (message.chat_type !== 'group') {
        return;
      }

      const chatId = message.chat_id;
      const senderOpenId = sender.sender_id?.open_id;
      const senderType = sender.sender_type || 'user';

      if (!chatId || !senderOpenId) {
        return;
      }

      const memberInfo = {
        member_type: senderType,
        tenant_key: sender.tenant_key || null
      };

      if (sender.sender_id?.union_id) {
        memberInfo.member_user_id = sender.sender_id.union_id;
      }

      feishuDb.upsertGroupMember(chatId, senderOpenId, memberInfo);

      console.log(`[GroupMemberCollector] Collected member: ${senderOpenId} in chat: ${chatId}`);

    } catch (error) {
      console.error('[GroupMemberCollector] Error collecting member info:', error.message);
    }
  }

  /**
   * 从@mentions中收集被提及的用户信息
   * @param {Object} event - 飞书消息事件
   */
  static async collectFromMentions(event) {
    try {
      const message = event.message;

      if (!message || message.chat_type !== 'group') {
        return;
      }

      const chatId = message.chat_id;
      const mentions = message.mentions || [];

      for (const mention of mentions) {
        const mentionId = mention.id?.open_id || mention.id?.user_id;
        const mentionName = mention.name;
        const mentionKey = mention.key;

        if (!mentionId) {
          continue;
        }

        if (mentionKey === '@_all') {
          continue;
        }

        const memberInfo = {
          member_name: mentionName || null,
          member_type: mention.id?.app_id ? 'app' : 'user',
          tenant_key: mention.tenant_key || null
        };

        feishuDb.upsertGroupMember(chatId, mentionId, memberInfo);

        console.log(`[GroupMemberCollector] Collected mentioned user: ${mentionName || mentionId}`);
      }

    } catch (error) {
      console.error('[GroupMemberCollector] Error collecting mentions:', error.message);
    }
  }

  /**
   * 获取群成员统计信息
   */
  static getStats(chatId) {
    try {
      return feishuDb.getGroupMemberStats(chatId);
    } catch (error) {
      console.error('[GroupMemberCollector] Error getting stats:', error.message);
      return null;
    }
  }

  /**
   * 获取群所有成员
   */
  static getMembers(chatId) {
    try {
      return feishuDb.getGroupMembers(chatId);
    } catch (error) {
      console.error('[GroupMemberCollector] Error getting members:', error.message);
      return [];
    }
  }
}
