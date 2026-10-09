/**
 * PM2 process definitions for the canonical server (deploy.sh starts from this file; `pm2 save` + the pm2-root
 * systemd unit resurrect it after a reboot). Restart behaviour, chosen with the API's boot contract in mind:
 * the API waits up to BOOT_DB_WAIT_SECONDS (90) for PostgreSQL, then exits non-zero; PM2 restarts it after
 * `restart_delay`, so a database that comes back late is picked up within about a minute and a half, forever.
 * A run longer than `min_uptime` counts as stable, so these waits never exhaust `max_restarts`.
 */
module.exports = {
  apps: [
    {
      name: "petlife-api",
      cwd: "/var/www/petlife-os/apps/api",
      script: "dist/main.js",
      exec_mode: "fork",
      autorestart: true,
      restart_delay: 5000,
      min_uptime: 10000,
      max_restarts: 50,
      kill_timeout: 10000,
    },
    {
      name: "petlife-web",
      cwd: "/var/www/petlife-os/apps/web",
      script: "/usr/bin/pnpm",
      args: "start",
      interpreter: "/usr/bin/node",
      exec_mode: "fork",
      autorestart: true,
      restart_delay: 3000,
      min_uptime: 10000,
      max_restarts: 50,
      kill_timeout: 10000,
    },
  ],
};
