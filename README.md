# Along · Hugo 个人博客 MVP

这是个人博客技术方案 Phase 1/2 的 Hugo 源码：一个无外部前端依赖、资源自托管、响应式的轻量主题，并附带从 Obsidian `Blog` 快照发布公开文章的安全脚本。Pagefind 与 Netlify 属于后续阶段，尚未集成。

## 快速开始

项目使用 Node.js `22.17.0` 和 Hugo Extended `0.161.1`（Hugo 已在 `0.166.0+extended` 验证）。先安装依赖：

```bash
npm ci
```

在仓库根目录启动本地站点：

```bash
hugo server -D
```

然后打开 Hugo 输出的本地地址。生成生产构建：

```bash
hugo --gc --minify
```

构建产物位于 `public/`，已被 `.gitignore` 排除。

## 配置与替换

- 站点标题、规范域名、RSS/Sitemap、菜单和 SEO 参数在 `hugo.yaml`。
- `params.author`、`params.email`、`params.github`、`params.resume` 和 `params.defaultImage` 是集中配置的明显占位值，请发布前替换。
- 首页布局在 `themes/along/layouts/home.html`；通用元信息在 `themes/along/layouts/_partials/head.html`。
- 文章放在 `content/writing/`，项目放在 `content/projects/`。每篇文章建议提供 `title`、`description`、`date`、`categories` 和 `tags`。
- 当前 3 篇文章和 2 个项目都明确标注为示例内容，请用真实资料替换或删除。

## 页面与边界

已包含首页、Writing 分类层级（engineering / essays / life）、Projects、About、Now、404、RSS、Sitemap、robots.txt，以及 canonical、description、Open Graph 和 Twitter Card。

## 从 Obsidian 发布文章

Phase 2 工具只接受 YAML 布尔值 `public: true`。旧字段 `publish` 不会触发发布。`OBSIDIAN_VAULT_PATH` 可以指向知识库根目录，也可以直接指向 `Blog` 目录；工具会递归扫描最终解析出的 `Blog`，并硬编码排除 `Blog/Public`。

- 校验 `title`、`description`、`created`、`category`、`public`，保留其他未知字段；
- 将 `created` 映射为 Hugo 的 `date`；
- 将播客等类型字段中的外部 `url` 安全映射为 `source_url`，避免覆盖 Hugo 页面路由；
- 转换 Obsidian 双链、图片嵌入和本地 Markdown 图片；
- 只复制文章实际引用且真实路径位于 `Blog` 内的附件；
- 检查绝对路径、常见 Token、私网地址、内部域名和自定义敏感词；
- 生成 `Blog/Public` 快照、`content/writing`、`static/images/published` 和 `.publish-manifest.json`。

macOS / Linux：

```bash
export OBSIDIAN_VAULT_PATH=/Users/lhl/Blog
npm run content:check      # 只校验，不写文件
npm run content:dry-run    # 展示新增/更新/删除/跳过/警告
npm run content:sync       # 校验通过后写入快照、Hugo 内容和 manifest
```

Windows PowerShell：

```powershell
$env:OBSIDIAN_VAULT_PATH="D:\path\to\HengLongWiki\Blog"
npm run content:check
npm run content:dry-run
npm run content:sync
```

可选地将敏感词逐行写入本仓库的 `.content-sensitive-words`，或通过 `CONTENT_SENSITIVE_WORDS_PATH` 指向其他本地文件；空行和以 `#` 开头的注释会被忽略。敏感词文件不会提交。

`.publish-manifest.json` 必须提交到公开仓库。它只记录相对路径和 SHA-256，用于下一次发布时识别受管文件并安全删除取消发布的内容，不包含 Vault 绝对路径。

### 安全边界

- `--check` 和 `--dry-run` 不写任何文件；任意文章失败时不会产生部分发布结果。
- 写入前先生成临时 staging；提交阶段只备份和替换 manifest 登记的文件，失败会回滚。
- `--write` 使用 `.publish.lock` 防止并发发布；若进程被强制终止，请确认没有发布任务运行后再删除残留锁文件。
- 未登记的 `content/writing` 文件、栏目 `_index.md`、Projects、About 和 Now 不会被删除；目标路径冲突会整体失败。
- 如果手工修改了 manifest 已登记的生成文件，后续同步会拒绝覆盖或删除；应把修改同步回 Obsidian 原文后再发布。
- `Blog/Public` 是全生成快照：首次运行时必须为空，后续不得混入 manifest 未登记的文件。
- 脚本不会执行 `git add`、commit 或 push，也不会自动检查图片 EXIF、截图二维码和个人信息；图片仍需人工审核。
- 请在私人 Obsidian 仓库的 `.gitignore` 中加入 `Blog/Public/`。

日常发布流程：

```bash
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
2. 替换或删除 3 篇示例文章与 2 个示例项目；它们都在正文首行标明了示例身份。
3. 将 `static/images/og-default.svg` 换成自己的 1200×630 PNG/JPEG 分享图（兼容更多社交平台），同步修改 `params.defaultImage`，并检查图片中不含隐私信息。
4. 执行 `npm test && npm run build`，确认发布安全用例和 Hugo 构建均通过。
