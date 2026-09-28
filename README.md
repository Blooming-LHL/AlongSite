# Along · Hugo 个人博客 MVP

这是个人博客技术方案 Phase 1 的 Hugo 源码示例：一个无外部前端依赖、资源自托管、响应式的轻量主题。仓库只包含公开内容和站点源码；Obsidian 同步脚本、Pagefind 与 Netlify 属于后续阶段，尚未集成。

## 快速开始

项目基准版本为 Hugo Extended `0.161.1`（最低支持 `0.146.0`，已在 `0.166.0+extended` 验证）。在仓库根目录运行：

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

Phase 1 不包含：Obsidian 发布脚本、敏感信息检查、Pagefind 搜索索引、Netlify 配置或部署脚本。不要把私人笔记直接复制到 `content/`。

## 目录

```text
content/          # 公开 Markdown 内容
themes/along/     # 本地轻量主题
static/            # 自托管 CSS 与分享卡片
hugo.yaml          # Hugo 配置
```

## 发布前检查

1. 把 `hugo.yaml` 中的 `baseURL`、作者、邮箱、GitHub 和简历地址替换为真实公开信息。
2. 替换或删除 3 篇示例文章与 2 个示例项目；它们都在正文首行标明了示例身份。
3. 将 `static/images/og-default.svg` 换成自己的 1200×630 PNG/JPEG 分享图（兼容更多社交平台），同步修改 `params.defaultImage`，并检查图片中不含隐私信息。
4. 执行 `hugo --gc --minify --logLevel info`，确认无模板错误或弃用警告。
