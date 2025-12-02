#!/usr/bin/env python3
# -*- coding: utf-8 -*-

from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
import json
import os
import uuid
from datetime import datetime
import fcntl
from pathlib import Path

app = Flask(__name__)
CORS(app)  # 启用CORS支持跨域请求

# 配置
PORT = 57014
DATA_DIR = Path(__file__).parent / 'data'
TASKS_FILE = DATA_DIR / 'tasks.json'
BACKUP_DIR = DATA_DIR / 'backups'

# 确保数据目录存在
DATA_DIR.mkdir(exist_ok=True)
BACKUP_DIR.mkdir(exist_ok=True)

def read_tasks():
    """读取任务数据"""
    if not TASKS_FILE.exists():
        return []

    try:
        with open(TASKS_FILE, 'r', encoding='utf-8') as f:
            fcntl.flock(f.fileno(), fcntl.LOCK_SH)
            data = json.load(f)
            fcntl.flock(f.fileno(), fcntl.LOCK_UN)
            return data
    except Exception:
        return []

def write_tasks(tasks):
    """写入任务数据"""
    try:
        # 备份现有数据
        if TASKS_FILE.exists():
            backup_file = BACKUP_DIR / f'tasks_{datetime.now().strftime("%Y%m%d_%H%M%S")}.json'
            with open(TASKS_FILE, 'r', encoding='utf-8') as f:
                backup_data = f.read()
            with open(backup_file, 'w', encoding='utf-8') as f:
                f.write(backup_data)

        # 写入新数据
        with open(TASKS_FILE, 'w', encoding='utf-8') as f:
            fcntl.flock(f.fileno(), fcntl.LOCK_EX)
            json.dump(tasks, f, ensure_ascii=False, indent=2)
            fcntl.flock(f.fileno(), fcntl.LOCK_UN)
        return True
    except Exception as e:
        print(f"写入数据失败: {e}")
        return False

@app.route('/')
def index():
    """返回前端页面"""
    return send_from_directory('.', 'index.html')

@app.route('/api/tasks', methods=['GET'])
def get_tasks():
    """获取所有任务"""
    tasks = read_tasks()
    return jsonify(tasks)

@app.route('/api/tasks', methods=['POST'])
def create_task():
    """创建新任务"""
    data = request.json
    if not data or not data.get('title'):
        return jsonify({'error': '任务标题不能为空'}), 400

    task = {
        'id': str(uuid.uuid4()),
        'title': data.get('title', ''),
        'description': data.get('description', ''),
        'priority': data.get('priority', 'medium'),
        'status': 'pending',
        'created_at': datetime.now().isoformat(),
        'completed_at': None,
        'updated_at': datetime.now().isoformat()
    }

    tasks = read_tasks()
    tasks.append(task)

    if write_tasks(tasks):
        return jsonify(task), 201
    else:
        return jsonify({'error': '保存任务失败'}), 500

@app.route('/api/tasks/<task_id>', methods=['PUT'])
def update_task(task_id):
    """更新任务"""
    data = request.json
    tasks = read_tasks()

    task_index = -1
    for i, task in enumerate(tasks):
        if task['id'] == task_id:
            task_index = i
            break

    if task_index == -1:
        return jsonify({'error': '任务不存在'}), 404

    # 更新任务字段
    task = tasks[task_index]
    if 'title' in data:
        task['title'] = data['title']
    if 'description' in data:
        task['description'] = data['description']
    if 'priority' in data:
        task['priority'] = data['priority']
    if 'status' in data:
        task['status'] = data['status']
        if data['status'] == 'completed' and not task.get('completed_at'):
            task['completed_at'] = datetime.now().isoformat()
        elif data['status'] == 'pending':
            task['completed_at'] = None

    task['updated_at'] = datetime.now().isoformat()

    if write_tasks(tasks):
        return jsonify(task)
    else:
        return jsonify({'error': '更新任务失败'}), 500

@app.route('/api/tasks/<task_id>', methods=['DELETE'])
def delete_task(task_id):
    """删除任务"""
    tasks = read_tasks()
    tasks = [task for task in tasks if task['id'] != task_id]

    if write_tasks(tasks):
        return jsonify({'message': '任务已删除'})
    else:
        return jsonify({'error': '删除任务失败'}), 500

@app.route('/api/tasks/stats', methods=['GET'])
def get_stats():
    """获取任务统计"""
    tasks = read_tasks()
    total = len(tasks)
    completed = len([t for t in tasks if t['status'] == 'completed'])
    pending = total - completed

    return jsonify({
        'total': total,
        'completed': completed,
        'pending': pending
    })

if __name__ == '__main__':
    print(f"任务待办清单后端服务启动在端口 {PORT}")
    app.run(host='0.0.0.0', port=PORT, debug=False)