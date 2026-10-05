# Along · Hugo 个人博客 MVP

这是个人博客技术方案 Phase 1/2/3 的 Hugo 源码：一个资源自托管、响应式的轻量主题，并附带从 Obsidian `Blog` 快照发布公开文章的安全脚本、Pagefind 搜索和 Netlify 部署配置。

## 快速开始

项目使用 Node.js `22.17.0` 和 Hugo Extended `0.161.1`（Hugo 已在 `0.166.0+extended` 验证）。先安装依赖：

```bash
npm ci
```

在仓库根目录启动本地站点：

```bash
hugo server -D
```

然后打开 Hugo 输出的本地地址。生成包含 Pagefind 搜索索引的生产构建：

```bash
npm run build
```

构建产物位于 `public/`，已被 `.gitignore` 排除。

普通的 `npm run dev` 适合开发 Hugo 页面，但不会生成 Pagefind 索引。需要连同站内搜索一起预览时运行：

```bash
npm run preview:search
```

然后访问终端显示的本地地址。该命令会先构建 Hugo，再生成中文搜索索引并启动静态预览服务。

## 配置与替换

- 首页顶部展示“今日灵感”：浏览器按本地日期从[一言语句接口](https://developer.hitokoto.cn/sentence/)获取一句话，成功后缓存在本机至次日；接口不可用、禁用 JavaScript 或离线时显示仓库内的静态寄语。页面只用 `textContent` 插入接口文本，不把外部内容当 HTML 执行。
- 全站采用彩色光晕背景和半透明玻璃卡片；配色与模糊程度集中在 `static/css/main.css` 的设计变量及 `.hero`、`.card` 等样式中。
- 站点标题、规范域名、RSS/Sitemap、菜单和 SEO 参数在 `hugo.yaml`。
- 左侧个人资料的姓名、头像和个性签名分别由 `params.author`、`params.avatar`、`params.signature` 配置；默认 `static/images/avatar.svg` 是字形占位头像，替换为自己的照片后同步更新 `params.avatar`。头像角上的状态标志由 `params.status.emoji` 和 `params.status.text` 控制，例如 `😊 / 开心`、`😢 / 难过`、`🏖️ / 休假中`、`🧋 / 喝奶茶中`；改动配置并重新部署即可让所有访客看到新状态。
- `params.email`、`params.github`、`params.resume` 和 `params.defaultImage` 请在发布前检查并替换为真实公开信息。
- 首页布局在 `themes/along/layouts/home.html`；通用元信息在 `themes/along/layouts/_partials/head.html`。
- 文章放在 `content/writing/`，项目放在 `content/projects/`。每篇文章建议提供 `title`、`description`、`date`、`categories` 和 `tags`。
- 示例文章和项目已清理；新的公开文章由 `content:sync` 写入 `content/writing/`，项目可按需添加到 `content/projects/`。

### 添加项目

在 `content/projects/` 新建 Markdown 文件，例如 `content/projects/my-project.md`：

```markdown
---
title: "我的项目"
description: "一句话介绍项目解决了什么问题。"
date: 2026-10-01
category: "个人项目"
status: "进行中"
stack: ["Python", "Hugo"]
github: "https://github.com/你的用户名/项目名"
featured: true
weight: 10
---

这里写项目背景、功能和进展。
```

保存后项目会出现在 Projects 页面；首页有项目时会自动显示“精选项目”。`featured: true` 表示优先展示在首页，`weight` 数字越小越靠前；如果没有项目标记为精选，首页会展示前 4 个项目。可运行 `npm run dev` 本地预览。

项目直接由网站仓库发布，不走 Obsidian 的 `content:sync` 流程；放进 `content/projects/` 就会公开，`public: false` 不能用来隐藏项目。

## 页面与边界

已包含首页、Writing 分类层级（engineering / essays / life）、Projects、About、Now、Search、404、RSS、Sitemap、robots.txt，以及 canonical、description、Open Graph 和 Twitter Card。Pagefind 只在 `/search/` 页面按需加载，索引 Writing、Projects、About 和 Now 等公开内容详情页。

## Pagefind 与 Netlify

生产构建顺序固定为 Hugo → Pagefind：

```bash
npm ci
npm run build
```

Hugo 会先清理并重新生成 `public/`，Pagefind 随后把中文索引写入 `public/pagefind/`。导航、页脚、首页、列表页、搜索页和 404 不进入索引，避免重复结果；搜索脚本与样式也不会进入首页首屏。

仓库根目录的 `netlify.toml` 已配置构建命令、发布目录、Node/Hugo 固定版本和 404 fallback。连接 Netlify 时选择 GitHub 仓库和 `main` 生产分支即可；Pull Request 的 Deploy Preview 需在 Netlify 项目设置中启用。

正式上线前还必须完成两项账户侧配置：

1. 将 `hugo.yaml` 的 `baseURL: "https://example.com/"` 替换为唯一的正式主域名，否则 canonical、RSS、Sitemap 和分享卡片仍会指向占位域名。
2. 在 Netlify 的 Domain management 中添加该域名并按提示配置 DNS；如同时使用裸域和 `www`，将非主域 301 重定向到主域。

`public/` 和 `public/pagefind/` 都是构建产物，不应提交到 Git。

## 从 Obsidian 发布文章

Phase 2 工具只接受 YAML 布尔值 `public: true`。旧字段 `publish` 不会触发发布。知识库路径默认按当前设备名从仓库根目录的 `vault-paths.json` 选择：MacBook 使用 `/Users/lhl/Blog`，`ALong-PC` 使用 `D:\Administrator\Documents\Blog`，无需每次设置环境变量。设备名匹配不区分大小写，Mac 的 `.local` 后缀可省略。换新设备时，先运行 `hostname`，把设备名和该机的 Blog 绝对路径加入配置；未配置的设备会报错，不会猜测路径。`OBSIDIAN_VAULT_PATH` 始终可以临时覆盖默认值，指向知识库根目录或直接指向 `Blog` 目录；工具会递归扫描最终解析出的 `Blog`，并硬编码排除 `Blog/Public`。

新笔记可以不手写 front matter。运行 `content:frontmatter` 时，每篇笔记都会检查 `title`、`description`、`created`、`category`、`public` 和 `tags`，无论是否已有 front matter。缺失或为空的字段会补齐：标题取文件名，描述取正文摘要，创建日期取文件创建时间（不可用时取修改时间），分类取直接父目录名（Blog 根目录下为“未分类”），发布状态默认为 `public: false`，标签默认为 `tags: []`。已有有效值、标签和其他自定义字段会保留；必要字段有非空但无效的值时会报错，修正后再运行。补齐结果写回私人知识库。只有你将某篇的 `public` 设为 YAML 布尔值 `true`，它才会进入公开发布流程。该命令不会写入网站的公开文章、图片或 manifest。

`tags: []` 表示暂时没有标签，可以在 Obsidian 中添加多个标签，或写成 `tags: [播客, 产品思考]`。同步后这些标签会出现在文章底部及站点标签分类中；空列表不会生成标签项。旧文章没有 `tags` 仍可同步，标签不是发布必填字段。

- 校验 `title`、`description`、`created`、`category`、`public`，保留其他未知字段；
- `created` 支持 `YYYY-MM-DD` 或带时区的 ISO 时间戳（例如 `2026-10-03T11:42:41+08:00`）；源笔记保留原值，同步时取其书写的日期作为公开文章的 `created` 和 Hugo 的 `date`；
- 将播客等类型字段中的外部 `url` 安全映射为 `source_url`，避免覆盖 Hugo 页面路由；
- 转换 Obsidian 双链、图片嵌入和本地 Markdown 图片；
- 只复制文章实际引用且真实路径位于 `Blog` 内的附件；
- 检查绝对路径、常见 Token、私网地址、内部域名和自定义敏感词；
- 生成 `Blog/Public` 快照、`content/writing`、`static/images/published` 和 `.publish-manifest.json`。

macOS / Linux：

```bash
npm run content:frontmatter # 检查并补齐所有必要字段（会写回 Blog）
npm run content:check      # 只校验，不写文件
npm run content:dry-run    # 展示新增/更新/删除/跳过/警告
npm run content:sync       # 校验通过后写入快照、Hugo 内容和 manifest
```

知识库不在默认位置时，先运行 `export OBSIDIAN_VAULT_PATH=/你的/Blog/路径`，或在单次命令前写 `OBSIDIAN_VAULT_PATH=/你的/Blog/路径 npm run content:check`。

Windows PowerShell（已配置 `ALong-PC`）：

```powershell
npm run content:frontmatter
npm run content:check
npm run content:dry-run
npm run content:sync
```

在 Windows 上临时切换知识库，可先运行 `$env:OBSIDIAN_VAULT_PATH="D:\其他路径\Blog"`。新设备的路径写入 `vault-paths.json` 时，JSON 中的反斜杠要写成 `\\`。

可选地将敏感词逐行写入本仓库的 `.content-sensitive-words`，或通过 `CONTENT_SENSITIVE_WORDS_PATH` 指向其他本地文件；空行和以 `#` 开头的注释会被忽略。敏感词文件不会提交。

`.publish-manifest.json` 必须提交到公开仓库。它只记录相对路径和 SHA-256，用于下一次发布时识别受管文件并安全删除取消发布的内容，不包含 Vault 绝对路径。

### 安全边界

- `content:frontmatter` 逐项补齐缺失或为空的必要字段，已有有效值会保留；补齐不会将笔记自动设为公开。`--check` 和 `--dry-run` 仍不写任何文件，任意文章失败时不会产生部分发布结果。
- 写入前先生成临时 staging；提交阶段只备份和替换 manifest 登记的文件，失败会回滚。
- `content:frontmatter` 与 `--write` 共用 `.publish.lock`，防止同时修改笔记和发布；若进程被强制终止，请确认没有任务运行后再删除残留锁文件。
- 未登记的 `content/writing` 文件、栏目 `_index.md`、Projects、About 和 Now 不会被删除；目标路径冲突会整体失败。
- 如果手工修改了 manifest 已登记的生成文件，后续同步会拒绝覆盖或删除；应把修改同步回 Obsidian 原文后再发布。
- `Blog/Public` 是全生成快照：首次运行时必须为空，后续不得混入 manifest 未登记的文件。
- 脚本不会执行 `git add`、commit 或 push，也不会自动检查图片 EXIF、截图二维码和个人信息；图片仍需人工审核。
- 请在私人 Obsidian 仓库的 `.gitignore` 中加入 `Blog/Public/`。

日常发布流程：

```bash
npm run content:frontmatter
npm run content:check
npm run content:dry-run
npm run content:sync
npm run dev
git diff -- content/writing static/images/published .publish-manifest.json
```

## 目录

```text
content/          # 公开 Markdown 内容
scripts/          # Phase 2 校验、转换与发布工具
test/             # 临时 Vault 集成测试
themes/along/     # 本地轻量主题
static/            # 自托管 CSS 与分享卡片
hugo.yaml          # Hugo 配置
```

## 发布前检查

1. 把 `hugo.yaml` 中的 `baseURL`、作者、邮箱、GitHub 和简历地址替换为真实公开信息。
2. 检查 `content/writing/` 和 `content/projects/`，确认只包含你准备公开的真实内容。
3. 将 `static/images/og-default.svg` 换成自己的 1200×630 PNG/JPEG 分享图（兼容更多社交平台），同步修改 `params.defaultImage`，并检查图片中不含隐私信息。
4. 执行 `npm test && npm run build`，确认发布安全用例和 Hugo 构建均通过。
