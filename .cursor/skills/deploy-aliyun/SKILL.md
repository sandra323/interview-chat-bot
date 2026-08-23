---
name: deploy-aliyun
description: >-
  Deploys or updates this interview-chat-bot on the Aliyun ECS via Docker Compose
  (SSH, server .env, build, health check). Use when the user asks to 部署, 上线,
  更新线上, deploy to the server, docker compose on ECS, or fix a production
  deploy on 47.116.108.250.
---

# Deploy Aliyun ECS

Project skill for **this repo only**. Target is Docker Compose behind Nginx on one ECS.

## Current target (override if the user says otherwise)

| Item | Value |
|------|--------|
| Host | `47.116.108.250` |
| SSH user | `root` (not a former OS account) |
| SSH key | Ask if unknown. Last used: `/Users/l.q/Desktop/wgg.pem` |
| Remote dir | `/root/interview-chat-bot` |
| Public URL | `http://47.116.108.250` |
| Git remote | `https://github.com/sandra323/interview-chat-bot.git` |

SSH:

```bash
ssh -o ServerAliveInterval=30 -o ServerAliveCountMax=20 \
  -i <pem> root@47.116.108.250
```

## Hard rules

- Never commit `.env`, `.env.local`, `*.pem`, or paste API keys / hashes into git or the skill.
- Compose on the server reads **`.env`**, not `.env.local`.
- Uploading secrets or running `docker compose up` on the server needs explicit user approval (Smart Mode / they asked to deploy).
- Do not `docker compose down -v` unless the user wants to wipe chat history (`chat-data` volume).

## Workflow

Copy and track:

```
- [ ] 1. Local main is the commit to ship; push if needed
- [ ] 2. SSH as root works
- [ ] 3. Server repo exists at /root/interview-chat-bot
- [ ] 4. Server .env is complete; hash $ escaped
- [ ] 5. docker compose up -d --build
- [ ] 6. Health + browser smoke
```

### 1. Ship the code you mean

From the workspace:

```bash
git status
git log -1 --oneline
```

If local deploy-related files differ from GitHub (Dockerfiles, compose volume), **scp those files** or commit + `git pull` on the server. First production deploy used scp for Dockerfile / compose because they were not on `main` yet.

### 2. First clone (skip if the dir exists)

```bash
ssh -i <pem> root@47.116.108.250 \
  'test -d /root/interview-chat-bot/.git || git clone https://github.com/sandra323/interview-chat-bot.git /root/interview-chat-bot'
```

Update path:

```bash
ssh -i <pem> root@47.116.108.250 \
  'cd /root/interview-chat-bot && git pull --ff-only'
```

Need Docker 20+ and Compose v2 on the host (`docker compose version`). Do not re-run `get.docker.com` if `docker` already exists.

### 3. Server `.env`

Required keys (values from local `.env.local`, never echo them in chat):

- `DEEPSEEK_API_KEY`
- `AUTH_USERNAME`
- `AUTH_PASSWORD_HASH`
- `CORS_ORIGIN=http://47.116.108.250` (must match the browser origin; include `https://` and port if used)
- Optional: `DEEPSEEK_API_URL`, `DEEPSEEK_DEFAULT_MODEL`, `AUTH_SESSION_TTL_HOURS`

**Hash escaping:** Compose interpolates `.env`. Every `$` in `AUTH_PASSWORD_HASH` must be `$$`.

```
# bcrypt $2b$10$abc...  →  $$2b$$10$$abc...
```

Missing key or bad hash → backend exits. Fix `.env`, then compose up again.

Write `.env` via scp of a gitignored local file, or edit on the server without printing secrets.

### 4. Build and start

```bash
ssh -o ServerAliveInterval=30 -o ServerAliveCountMax=20 -i <pem> \
  root@47.116.108.250 \
  'cd /root/interview-chat-bot && docker compose up -d --build'
```

Expect: backend `healthy`, frontend `0.0.0.0:80->80`. First build can take several minutes.

### 5. Verify

On the server:

```bash
docker compose -f /root/interview-chat-bot/docker-compose.yml ps
curl -sS http://127.0.0.1/health
```

From the agent machine:

```bash
curl -sS -o /dev/null -w "%{http_code}\n" --connect-timeout 8 http://47.116.108.250/health
```

`{"status":"ok",...,"llmConfigured":true}` and public `200` → tell the user to open `http://47.116.108.250` and log in with `AUTH_USERNAME` + the **plaintext** password that matches the hash (do not invent a new password).

If containers are up but public curl fails: Aliyun security group inbound **TCP 80** (and 22 for SSH).

## Topology (do not change unless asked)

Browser → `:80` Nginx (frontend image) → `/api`, `/ws`, `/health` → `backend:3001`. Backend is not published. SQLite is `/app/backend/.data` → volume `chat-data`.

## China build constraints

Keep these; they are why the first Alpine/Debian builds failed:

- Backend image: `node:20-alpine`, apk mirror `mirrors.aliyun.com`, `NPM_CONFIG_REGISTRY=https://registry.npmmirror.com`, `npm_config_nodedir=/usr/local` (do not download Node headers from unofficial-builds).
- Install/compile `better-sqlite3` **once in the builder**; runner **copies `node_modules`**. Do not `npm install` again on the runner.
- Frontend builder: same npm registry.
- Do not switch the backend to `bookworm-slim` on this ECS: `deb.debian.org` timed out.

If sqlite compile fails again, check `nodedir` and that builder still has `python3 make g++`.

## Routine update vs first deploy

| | First | Later |
|--|--------|--------|
| Clone | yes | no |
| `.env` | create + escape hash | only if secrets/CORS change |
| Code | clone or scp | `git pull` and/or scp uncommitted Docker files |
| Start | `up -d --build` | same |

## After deploy

Report URL, login username (not the hash), health result. Mention uncommitted deploy file changes if any. Do not commit `.env`.

For extra troubleshooting, see [troubleshoot.md](troubleshoot.md).
