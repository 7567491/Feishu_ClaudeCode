/**
 * 音频转写模块 - 使用百度 ASR API
 *
 * 支持多种音频格式，自动处理转码
 */

import AipSpeech from 'baidu-aip';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { promisify } from 'util';

const unlinkAsync = promisify(fs.unlink);

export class AudioTranscriber {
  constructor(config = {}) {
    const {
      appId = process.env.BAIDU_ASR_APP_ID,
      apiKey = process.env.BAIDU_ASR_API_KEY,
      secretKey = process.env.BAIDU_ASR_SECRET_KEY
    } = config;

    if (!appId || !apiKey || !secretKey) {
      console.warn('[AudioTranscriber] 百度 ASR 凭据未配置，语音转文字功能不可用');
      console.warn('[AudioTranscriber] 请在 .env 中设置 BAIDU_ASR_APP_ID, BAIDU_ASR_API_KEY, BAIDU_ASR_SECRET_KEY');
      this.enabled = false;
      return;
    }

    this.client = new AipSpeech.speech(appId, apiKey, secretKey);
    this.enabled = true;
    console.log('[AudioTranscriber] 初始化成功，使用百度 ASR API');
  }

  /**
   * 转写音频缓冲区
   * @param {Buffer} audioBuffer - 音频数据
   * @param {Object} options - 转写选项
   * @returns {Promise<string>} 转写文本
   */
  async transcribe(audioBuffer, options = {}) {
    if (!this.enabled) {
      throw new Error('音频转写功能未启用：缺少百度 ASR 凭据');
    }

    const {
      format = 'amr',  // 飞书默认格式
      rate = 8000,     // 采样率：amr 通常是 8000
      dev_pid = 1537   // 1537 = 普通话（纯中文识别）
    } = options;

    try {
      console.log('[AudioTranscriber] 开始转写音频...');
      console.log(`  - 格式: ${format}`);
      console.log(`  - 采样率: ${rate}`);
      console.log(`  - 数据大小: ${(audioBuffer.length / 1024).toFixed(2)} KB`);

      // 调用百度 ASR API
      const result = await this.client.recognize(audioBuffer, format, rate, {
        dev_pid: dev_pid,
        cuid: 'feishu_bot'  // 用户唯一标识
      });

      if (result.err_no === 0) {
        const text = result.result?.[0] || '';
        console.log('[AudioTranscriber] 转写成功:', text);
        return text;
      } else {
        throw new Error(`百度 ASR 错误 ${result.err_no}: ${result.err_msg}`);
      }

    } catch (error) {
      console.error('[AudioTranscriber] 转写失败:', error.message);
      throw error;
    }
  }

  /**
   * 转写音频文件
   * @param {string} filePath - 音频文件路径
   * @param {Object} options - 转写选项
   * @returns {Promise<string>} 转写文本
   */
  async transcribeFile(filePath, options = {}) {
    try {
      const buffer = fs.readFileSync(filePath);

      // 自动检测格式
      const ext = path.extname(filePath).toLowerCase().substring(1);
      const formatMap = {
        'amr': 'amr',
        'wav': 'wav',
        'pcm': 'pcm',
        'm4a': 'wav',  // m4a 需要转码为 wav
        'mp3': 'wav',  // mp3 需要转码为 wav
        'opus': 'wav', // opus 需要转码为 wav
        'ogg': 'wav'   // ogg 需要转码为 wav
      };

      const format = formatMap[ext] || 'amr';

      // 如果需要转码，先转换为 wav
      if (['m4a', 'mp3', 'opus', 'ogg'].includes(ext)) {
        console.log(`[AudioTranscriber] 检测到 ${ext} 格式，转换为 wav...`);
        const wavPath = filePath.replace(path.extname(filePath), '.wav');
        await this._convertToWav(filePath, wavPath);

        try {
          const result = await this.transcribeFile(wavPath, { ...options, format: 'wav', rate: 16000 });
          // 清理临时文件
          await unlinkAsync(wavPath).catch(() => {});
          return result;
        } catch (error) {
          await unlinkAsync(wavPath).catch(() => {});
          throw error;
        }
      }

      return await this.transcribe(buffer, { ...options, format });

    } catch (error) {
      console.error('[AudioTranscriber] 转写文件失败:', error.message);
      throw error;
    }
  }

  /**
   * 使用 ffmpeg 将音频转换为 wav 格式
   * @private
   * @param {string} inputPath - 输入文件路径
   * @param {string} outputPath - 输出文件路径
   * @returns {Promise<void>}
   */
  async _convertToWav(inputPath, outputPath) {
    return new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', [
        '-i', inputPath,
        '-ar', '16000',  // 采样率 16kHz
        '-ac', '1',      // 单声道
        '-f', 'wav',     // 输出格式
        '-y',            // 覆盖已存在文件
        outputPath
      ]);

      let errorOutput = '';

      ffmpeg.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      ffmpeg.on('close', (code) => {
        if (code === 0) {
          console.log('[AudioTranscriber] 音频转换成功');
          resolve();
        } else {
          console.error('[AudioTranscriber] ffmpeg 输出:', errorOutput);
          reject(new Error(`ffmpeg 转换失败，退出码: ${code}`));
        }
      });

      ffmpeg.on('error', (error) => {
        reject(new Error(`无法启动 ffmpeg: ${error.message}。请确保已安装 ffmpeg`));
      });
    });
  }

  /**
   * 检查是否可用
   * @returns {boolean}
   */
  isEnabled() {
    return this.enabled;
  }
}

// 导出单例（可选）
let instance = null;

export function getAudioTranscriber() {
  if (!instance) {
    instance = new AudioTranscriber();
  }
  return instance;
}
