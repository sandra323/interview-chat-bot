# Deploy troubleshoot

Read this only when the main workflow fails.

## SSH `Permission denied (publickey,...)`

- User must be `root` after a reinstall. Old accounts (e.g. `sandra323`) are gone.
- `chmod 400` on the pem.
- Confirm the ECS key pair matches the pem in Aliyun console.

## Compose warns `variable is not set` (name looks like part of a bcrypt hash)

`.env` `AUTH_PASSWORD_HASH` `$` were not escaped. Rewrite as `$$`. Restart compose.

## Backend not healthy / exits immediately

```bash
ssh -i <pem> root@47.116.108.250 \
  'docker compose -f /root/interview-chat-bot/docker-compose.yml logs backend --tail 80'
```

Typical: missing `DEEPSEEK_API_KEY` or invalid `AUTH_PASSWORD_HASH`.

## `better-sqlite3` / node-gyp `ETIMEDOUT` unofficial-builds

Do not download headers. Builder must set `npm_config_nodedir=/usr/local` and compile there; runner copies `node_modules`.

## `apt-get` / `deb.debian.org` timeout

Stay on Alpine + Aliyun apk. Do not use Debian slim on this host.

## Port 80 locally works, public does not

Security group: inbound TCP 80 from the client IP (or `0.0.0.0/0` for a demo). 22 already open if SSH works.

## Login works, chat/CORS fails

`CORS_ORIGIN` must equal the address bar origin (`http://47.116.108.250`, no trailing slash). If mapped as `8080:80`, include `:8080`.

## History vanished after recreate

Volume was removed (`down -v`) or compose lacked `chat-data:/app/backend/.data`. Check `docker volume ls | grep chat-data`.
