module.exports = {
  apps: [{
    name: 'zhanglu-todolist',
    script: './app.py',
    interpreter: 'python3',
    cwd: '/home/ccp/zhanglu_31',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '256M',
    env: {
      PORT: 57004
    }
  }]
};
