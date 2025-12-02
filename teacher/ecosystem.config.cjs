module.exports = {
  apps: [{
    name: 'ai-teacher',
    script: 'app.py',
    interpreter: 'python3',
    cwd: '/home/ccp/teacher',
    env: {
      Feishu_Teacher_App_ID: 'cli_a9ad59fd26389cee',
      Feishu_Teacher_App_Secret: 'Xql6krkMd6m9zyzHKOMtrgqgp5zC7oqf',
      TEACHER_GROUP_ID: 'oc_15a90daa813d981076ffa50c0de0b5e4',
      TEACHER_WEBHOOK_PORT: '33301',
      TEACHER_WEBHOOK_PATH: '/webhook/feishu'
    },
    autorestart: true,
    watch: false,
    max_memory_restart: '200M',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    min_uptime: '10s',
    max_restarts: 10
  }]
}