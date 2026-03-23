module.exports = {
  apps: [
    {
      name: "memoriales-bot",
      cwd: "/home/ivanam/projects/memorial",
      script: "./dist/index.js",
      instances: 1,
      exec_mode: "fork",
      max_memory_restart: "500M",
      env: {
        NODE_ENV: "production",
        PORT: 8780,
        PUBLIC_URL: "http://memorialescelestiales.com"
      },
      env_file: "/home/ivanam/projects/memorial/.env",
      error_file: "./logs/error.log",
      out_file: "./logs/out.log",
      autorestart: true
    }
  ]
};