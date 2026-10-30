const path = require('node:path');

module.exports = {
  apps: [{
    name: 'comptabilitat',
    cwd: path.resolve(__dirname, '..'),
    script: 'backend/src/server.js',
    instances: 1,
    exec_mode: 'fork',
    watch: false,
    autorestart: true,
    restart_delay: 3000,
    kill_timeout: 10000,
    time: true,
    env: { NODE_ENV: 'production' },
  }],
};
