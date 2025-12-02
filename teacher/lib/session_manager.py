#!/usr/bin/env python3
"""
会话管理器 - 管理用户会话状态
"""
from typing import Dict, Optional
from datetime import datetime
import json
import os
import logging

logger = logging.getLogger(__name__)


class SessionManager:
    """会话管理器"""

    def __init__(self, session_file: str = None):
        """初始化会话管理器

        Args:
            session_file: 会话持久化文件路径，默认为teacher/sessions.json
        """
        # 会话存储: {user_id: session_data}
        self.sessions = {}

        # 会话文件路径
        if session_file is None:
            self.session_file = os.path.join(
                os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                'sessions.json'
            )
        else:
            self.session_file = session_file

        # 加载已存在的会话
        self._load_sessions()

    def create_session(self, user_id: str, user_nickname: str) -> Dict:
        """
        创建新会话

        Args:
            user_id: 用户ID
            user_nickname: 用户昵称

        Returns:
            会话数据
        """
        session = {
            'user_id': user_id,
            'user_nickname': user_nickname,
            'state': 'menu',  # menu, waiting_choice, processing
            'selected_app': None,
            'created_at': datetime.now().isoformat(),
            'last_activity': datetime.now().isoformat(),
            'message_count': 0
        }
        self.sessions[user_id] = session
        self._save_sessions()  # 保存到文件
        return session

    def get_session(self, user_id: str) -> Optional[Dict]:
        """
        获取会话

        Args:
            user_id: 用户ID

        Returns:
            会话数据，不存在返回None
        """
        return self.sessions.get(user_id)

    def update_session(self, user_id: str, updates: Dict) -> bool:
        """
        更新会话

        Args:
            user_id: 用户ID
            updates: 更新内容

        Returns:
            是否成功
        """
        if user_id in self.sessions:
            self.sessions[user_id].update(updates)
            self.sessions[user_id]['last_activity'] = datetime.now().isoformat()
            self._save_sessions()  # 保存到文件
            return True
        return False

    def set_state(self, user_id: str, state: str) -> bool:
        """
        设置会话状态

        Args:
            user_id: 用户ID
            state: 新状态

        Returns:
            是否成功
        """
        return self.update_session(user_id, {'state': state})

    def set_selected_app(self, user_id: str, app_id: int, app_info: Dict) -> bool:
        """
        设置选择的应用

        Args:
            user_id: 用户ID
            app_id: 应用ID
            app_info: 应用信息

        Returns:
            是否成功
        """
        return self.update_session(user_id, {
            'selected_app': app_id,
            'app_info': app_info,
            'state': 'processing'
        })

    def is_first_message(self, user_id: str) -> bool:
        """
        判断是否为首次消息

        Args:
            user_id: 用户ID

        Returns:
            是否为首次消息
        """
        session = self.get_session(user_id)
        if not session:
            return True
        return session.get('message_count', 0) == 0

    def increment_message_count(self, user_id: str) -> int:
        """
        增加消息计数

        Args:
            user_id: 用户ID

        Returns:
            当前消息数
        """
        if user_id in self.sessions:
            self.sessions[user_id]['message_count'] = \
                self.sessions[user_id].get('message_count', 0) + 1
            self.sessions[user_id]['last_activity'] = datetime.now().isoformat()
            self._save_sessions()  # 保存到文件
            return self.sessions[user_id]['message_count']
        # 会话不存在时返回1，表示这是第一条消息
        return 1

    def clear_session(self, user_id: str) -> bool:
        """
        清除会话

        Args:
            user_id: 用户ID

        Returns:
            是否成功
        """
        if user_id in self.sessions:
            del self.sessions[user_id]
            self._save_sessions()  # 保存到文件
            return True
        return False

    def get_all_sessions(self) -> Dict:
        """
        获取所有会话

        Returns:
            所有会话数据
        """
        return self.sessions.copy()

    def _load_sessions(self):
        """从文件加载会话数据"""
        if os.path.exists(self.session_file):
            try:
                with open(self.session_file, 'r', encoding='utf-8') as f:
                    self.sessions = json.load(f)
                logger.info(f"Loaded {len(self.sessions)} sessions from {self.session_file}")
            except Exception as e:
                logger.error(f"Failed to load sessions: {e}")
                self.sessions = {}
        else:
            logger.info("No existing session file, starting with empty sessions")

    def _save_sessions(self):
        """保存会话数据到文件"""
        try:
            # 创建目录（如果不存在）
            os.makedirs(os.path.dirname(self.session_file), exist_ok=True)

            # 保存会话数据
            with open(self.session_file, 'w', encoding='utf-8') as f:
                json.dump(self.sessions, f, ensure_ascii=False, indent=2)
            logger.debug(f"Saved {len(self.sessions)} sessions to {self.session_file}")
        except Exception as e:
            logger.error(f"Failed to save sessions: {e}")