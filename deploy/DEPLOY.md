# 部署手册（design/20.0 Step6）—— 阿里云 ECS + MongoDB + Nginx + PM2 + HTTPS

目标：公网可访问，新号能完整玩 7 天流程。架构为「同源」：Nginx 同时托管静态客户端与反代 `/api` 到 Node(:3000)，客户端 `apiBase=""` 走同源，无 CORS。

## 0. 前置
- 阿里云 ECS（Ubuntu 22.04 / 2C4G 起步），安全组放行 80/443。
- 域名已解析到 ECS 公网 IP（HTTPS 需要）。
- MongoDB：阿里云 MongoDB 实例，或本机 `apt install mongodb-org`。

## 1. 拉代码 + 装依赖
```bash
sudo mkdir -p /var/www/xiuxiangame && sudo chown $USER /var/www/xiuxiangame
git clone git@github.com:qingpao523/xiuxiangame.git /var/www/xiuxiangame
cd /var/www/xiuxiangame/server
npm ci --omit=dev          # 生产依赖（不含 mongodb-memory-server）
```

## 2. 配置环境变量
```bash
cp deploy/.env.example deploy/.env
# 编辑 deploy/.env：MONGO_URL 指向你的 MongoDB；JWT_SECRET 用 `openssl rand -hex 32`
export $(grep -v '^#' deploy/.env | xargs)   # 或经 PM2 env 注入
```

## 3. PM2 启动 Node 服务
```bash
sudo npm i -g pm2
JWT_SECRET="$(openssl rand -hex 32)" pm2 start deploy/ecosystem.config.js --env production
pm2 save && pm2 startup        # 开机自启
curl http://127.0.0.1:3000/api/health   # 应返回 {"ok":true,...}
```

## 4. Nginx（先 HTTP 申请证书，再启 HTTPS）
```bash
sudo apt install nginx certbot python3-certbot-nginx
sudo cp deploy/nginx.conf /etc/nginx/conf.d/xiuxiangame.conf
# 改 server_name 为你的域名；先注释掉 443 server 块与 301 跳转，仅留 80 静态+反代
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d your-domain.com    # 申请证书
# 恢复完整 nginx.conf（含 443 块），再 nginx -t && reload
```

## 5. 验收
- 浏览器开 `https://your-domain.com/` → 未登录跳 `login.html`。
- 注册新号 → 进游戏，境界 `rq_01`。
- 玩 7 天：升重 / 打 Boss / 破劫，刷新后存档不丢（服务端为唯一真相）。
- F12 改 localStorage 后刷新 → 被服务端 state 覆盖（反作弊生效）。
- `GET /api/leaderboard` 返回排名，名字打码。

## 运维要点
- 频率限制为**进程内 Map**：`ecosystem.config.js` 设 `instances:1`。横向扩容多实例时，需把 `middleware/rate-limit.js` 换成 Redis 后端。
- 战斗 / 升重 / 破劫奖励均由服务端 vm 沙箱权威结算（`game-runtime.js`），客户端无法伪造结果。
- 日志：`pm2 logs xiuxiangame-server`。
