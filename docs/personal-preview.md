# 个人服务器自动预览

工作电脑仅用于浏览器访问 Codex、GitHub 和预览网址。代码修改、构建和传输全部在云端完成。

```text
Codex 云环境修改源码 → 推送 GitHub main
→ GitHub Actions 构建 Hugo + Pagefind
→ Actions 通过 SSH 上传静态网页至个人服务器
→ 浏览器访问预览网址
```

此方案不要求 Codex 云环境直连服务器，也不要求工作电脑执行 SSH 或安装开发工具。服务器必须允许 GitHub 执行器访问其 SSH 服务。首次服务器初始化可以使用云厂商提供的网页控制台，或在个人设备上完成。

## 首次接入

1. 在服务器上确认已有 Web 服务、可用域名/端口，确定用于预览的独立站点。保留其他网站的配置。
2. 创建一个供部署使用的用户或使用已授权的用户。准备其可写目录，例如 `/srv/alongsite-preview`；Web 服务需能读取该目录中的文件。预览站点的文档根目录设为 `/srv/alongsite-preview/current`，并提供静态文件及正确的 404 响应。
3. 为 GitHub 部署生成专用 SSH 密钥，把公钥加入部署用户的 `authorized_keys`。私钥只存入 GitHub Actions Secrets，不写入代码仓库，也无需提供给 Codex 聊天。
4. 从可信的服务器控制台核实 SSH 主机公钥，保存对应 known_hosts 行。不要关闭主机验证。非默认端口对应的主机名格式为 `[主机]:端口`。
5. 在 GitHub 仓库的 **Settings → Secrets and variables → Actions** 填写下表。完成实际服务器和 Web 服务配置后，将启用变量设为 `true`。
6. 打开 **Actions → Build and deploy personal preview → Run workflow** 完成第一次发布。之后每次推送 `main` 都会构建、发布并检查线上提交号。

### Secrets

| 名称 | 内容 |
| --- | --- |
| `PERSONAL_SERVER_SSH_KEY` | 专用部署私钥，包含完整多行内容，供非交互登录使用 |
| `PERSONAL_SERVER_KNOWN_HOSTS` | 已通过可信渠道核实的服务器 known_hosts 行 |

### Variables

| 名称 | 内容 |
| --- | --- |
| `PERSONAL_SERVER_HOST` | 服务器公网 IP 或可解析主机名 |
| `PERSONAL_SERVER_USER` | 部署用户名 |
| `PERSONAL_SERVER_PORT` | SSH 端口，默认 `22` |
| `PERSONAL_DEPLOY_ROOT` | 部署目录，默认 `/srv/alongsite-preview` |
| `PERSONAL_PREVIEW_URL` | 浏览器可访问的预览站点根网址，例如 `https://preview.example.com/`；也支持独立 HTTP IP/端口网址 |
| `PERSONAL_PREVIEW_ENABLED` | 首次接入完成后设为 `true`；未配置时只构建，不连接服务器 |

`PERSONAL_PREVIEW_URL` 会用于 Hugo 构建时的 baseURL，避免预览页面的 canonical、分享链接和绝对资源地址仍指向 Netlify。当前部署脚本使用站点根路径，不支持 URL 子目录。

## 发布行为

工作流安装仓库固定版本的 Node.js 和 Hugo Extended，核对 Hugo 发布包校验和，执行 `npm ci` 与 `npm run build`。构建成功后上传整个 `public/`，其中包含两版简介、CV 和搜索索引。

服务器先将完整产物解压到新版本目录，确认入口和 Pagefind 索引存在，再原子切换 `current` 符号链接。上传失败或产物不完整时不切换现有版本。旧版本保留在 `releases/`，可供回退；此脚本不自动删除旧版本。

发布完成后，Actions 请求预览站点的 `deployment.json`，核对其 commit 与本次 Git 提交完全一致。只有核对通过，才在 Actions 摘要里显示 **Personal preview ready** 和可访问链接。该标记只包含公开提交号，不包含凭据。

首次安装 Web 服务、域名解析、HTTPS 证书和云安全组配置需要按服务器现状完成；提交工作流本身不会替你完成这些初始化步骤。

## 腾讯云轻量服务器：本次接入

目标服务器公网地址为 `42.193.226.154`，目前没有网站或域名。可先使用 `http://42.193.226.154/` 作为浏览器预览入口；真正发布成功之前，这个地址不代表已经可用。

腾讯云提供无需安装本地客户端的 OrcaTerm 网页登录：在[轻量应用服务器控制台](https://console.cloud.tencent.com/lighthouse/instance/index)找到目标实例，点击“登录”，进入网页终端。参见[官方 OrcaTerm 登录文档](https://cloud.tencent.cn/document/product/1207/44642)。如果一键登录不可用，官方也提供[浏览器 VNC 登录](https://cloud.tencent.com/document/product/1207/46824)。

第一次进入网页终端后先执行以下只读命令，以确认系统、身份和端口使用情况：

```bash
cat /etc/os-release
whoami
ss -ltn
```

确认操作系统后再安装适合它的 Nginx 包、准备目录与部署公钥。仓库已提供 `deploy/nginx-preview.conf`，使用独立站点名和 IP Host 匹配，不需要先购买域名。安装前应先检查已有 Nginx 配置，保留现有服务。

服务器侧准备完成后，在实例的“防火墙”中确认 HTTP（TCP 80）允许浏览器访问，并允许 GitHub 执行器访问实际 SSH 端口。保留已有管理规则，不要覆盖整套规则；如果服务器已启用操作系统防火墙，也需确认相应端口。参见[腾讯云防火墙文档](https://cloud.tencent.com/document/product/1207/44577/)。

本次仓库 Variables 可使用：

```text
PERSONAL_SERVER_HOST=42.193.226.154
PERSONAL_SERVER_USER=<初始化后确认的部署用户>
PERSONAL_SERVER_PORT=22
PERSONAL_DEPLOY_ROOT=/srv/alongsite-preview
PERSONAL_PREVIEW_URL=http://42.193.226.154/
PERSONAL_PREVIEW_ENABLED=true
```

最后一项仅在服务器站点、目录、公钥和 GitHub Secrets 都准备好后启用。当前没有向服务器执行任何命令，也没有设置任何凭据。


## Ubuntu 24.04 的初始化脚本

已根据本次服务器确认的信息（Ubuntu 24.04、root 网页终端、80 端口空闲）提供 `scripts/setup-preview-server.sh`。在服务器网页终端执行，不在工作电脑执行：

```bash
curl -fL --retry 2 --connect-timeout 15 --max-time 120 https://raw.githubusercontent.com/Blooming-LHL/AlongSite/main/scripts/setup-preview-server.sh -o /tmp/alongsite-setup.sh && bash /tmp/alongsite-setup.sh
```

脚本创建 `alongsite-deploy` 用户、部署目录及独立 Nginx 站点，生成专用部署密钥，使用本机 SSH 校验该用户确实能写入部署目录，并验证 HTTP 本机访问。该用户没有 sudo 权限，公钥禁用端口转发和交互式终端；安装后的服务由 systemd 管理。脚本不会更改已有 SSH 配置，不会启用 UFW；如 UFW 已启用，只添加 HTTP 80 的允许规则。

看到 `SETUP_OK` 后，在腾讯云轻量服务器的防火墙中确认 HTTP 80 已放行，再用浏览器打开 `http://42.193.226.154/`。此时应看到“预览环境已准备好”，表示 Web 服务已工作；真正博客会在首次 Actions 发布后出现。

首次接入还需在 GitHub 页面配置两个 Secrets。下面命令的输出只复制到 GitHub，不发送到聊天，也不提交到仓库：

- `PERSONAL_SERVER_SSH_KEY`：在服务器网页终端运行 `cat /root/.alongsite-preview-setup/github-actions-key`，复制完整私钥（含 BEGIN/END 行）至对应 Secret。
- `PERSONAL_SERVER_KNOWN_HOSTS`：在服务器网页终端运行 `cat /root/.alongsite-preview-setup/github-known-hosts.txt`，复制至对应 Secret。

本次用户名使用 `PERSONAL_SERVER_USER=alongsite-deploy`；其他 Variables 按上表设置。填写完成后启用 `PERSONAL_PREVIEW_ENABLED=true`，在 Actions 手动运行首次部署。

专用私钥保存在服务器 root 专属目录（目录 700、私钥 600）与 GitHub Secret 中；初始化脚本本身不会打印其内容。以后重复运行不会重新生成已存在的密钥，也不会将已发布网站替换回初始化页面。


### 初始化提示 Missing privilege separation directory

如果安装依赖成功后停在 `Missing privilege separation directory: /run/sshd`，说明 SSH 的运行目录缺失，失败点是 `sshd -T` 配置检查。新版脚本会在检查前补建 root 所有、权限为 755 的 `/run/sshd`；这不会重启 SSH 或改变已有 SSH 配置。

已下载旧版脚本的服务器也可以在原来的 root 网页终端执行：

```bash
install -d -o root -g root -m 755 /run/sshd && bash /tmp/alongsite-setup.sh
```

初始化脚本会复用此前创建的部署用户和密钥，继续后续步骤；无需重装系统或重新生成密钥。
