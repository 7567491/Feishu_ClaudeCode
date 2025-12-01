#!/usr/bin/env python3
"""
会话管理器 - 管理用户会话状态
"""
from typing import Dict, Optional
from datetime import datetime


class SessionManager:
    """会话管理器"""

    def __init__(self):
        """初始化会话管理器"""
        # 会话存储: {user_id: session_data}
        self.sessions = {}

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
            return self.sessions[user_id]['message_count']
        return 0

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
            return True
        return False

    def get_all_sessions(self) -> Dict:
        """
        获取所有会话

        Returns:
            所有会话数据
        """
        return self.sessions.copy()