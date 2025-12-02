/**
 * 统一的配置加载模块
 * 解决凭证初始化重复问题
 */

import { credentialsDb } from '../../database/db.js';

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

export default ConfigLoader;