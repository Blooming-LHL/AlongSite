# Along · Hugo 个人博客 MVP

这是个人博客技术方案 Phase 1/2/3 的 Hugo 源码：一个资源自托管、响应式的轻量主题，并附带从 Obsidian `Blog` 快照发布公开文章的安全脚本、Pagefind 搜索和 Netlify 部署配置。

## 个人服务器自动预览

已提供 GitHub Actions 构建与发布流程，详见 [个人服务器自动预览](docs/personal-preview.md)。首次完成服务器和 GitHub 凭据配置后，推送 `main` 即可更新个人服务器，工作电脑只需使用浏览器。默认只构建，尚未启用服务器发布。

## 个人主页与博客

- `/` 直接展示英文个人简介；顶部只有身份标识、`My Blog` 和 `EN / 中文`。中文入口为 `/cn/about`，普通链接切换不依赖 JavaScript。
- `/blog/` 保留每日寄语、文章瀑布流、分类和标签。博客导航中的“个人主页”返回 `/`；原有文章、分类、搜索与 RSS 地址不变。
- 个人简介首屏以姓名、AI Engineer、当前任职和独立照片区呈现身份；工作与教育以开放排版展示。顶部 My Blog 是简介中唯一的博客入口，左侧目录、首屏重复按钮和正文博客卡片均已移除。
- OPPO 正式工作与阿里云实习仅输出时间、职位、公司和部门。阿里云部门为“数据库产品部 / Database Products Department”；不再输出具体工作、项目指标或获奖说明，Research 统计也不再渲染。原始工作、研究与项目资料仍保存在数据文件中，教育信息不作无关改写。`data/portfolio.yaml` 管理双语资料，`data/profile_ui.yaml` 管理界面文案。
- Selected Work 从 `content/projects/` 读取 `featured: true` 的项目，按 `weight` 从小到大展示名称、简介、技术栈、状态与可选 GitHub、在线演示链接。没有精选项目时只保留低高度标题。Technical Skills、Résumé 继续留白，不输出技能列表或下载按钮；简介现有 GitHub 联系入口与博客联系方式保持不变。
- 项目和技能原始数据仍在仓库，未删除。`static/cv/` PDF 及 `/cv/zh/`、`/cv/en/` 打印页也仍可通过原地址访问；本轮只暂停简介入口，没有撤回这些公开资源。
- 首页和中文简介共用 `themes/along/layouts/_partials/profile-body.html`。`static/css/portfolio.css` 采用近白背景、克制的页头玻璃、明确的紫色博客按钮；桌面使用文字与照片两列，手机使用单列。阅读面板、瀑布流算法和文章交互保持原样。
- `hugo.yaml` 的 `params.profile_photo` 管理真实照片路径，例如 `/images/portrait.jpg`（文件放在 `static/images/portrait.jpg`）。未填写时显示中性 4:5 预留框，没有伪造人像或破损图片。接入照片后使用固定宽高、`object-fit: cover` 与有意义的替代文本。`profile_intro` 是简介专用短文案，不覆盖 CV 使用的原始 `intro`。
- `/en/about/` 兼容至英文首页；旧 `/about/` 兼容至 `/cn/about`。Netlify 配置 301；静态本地预览提供无 JavaScript 也可工作的兼容跳转页。Nginx 的对应规则已纳入站点模板与初始化/端口迁移脚本。
- 已初始化的个人服务器需要在网页终端重新应用一次最新 `scripts/set-preview-port.sh 8081`，才能获得服务器级 301 和 `/cn/about` 无尾斜杠路由；源码推送不会自动修改需要 root 权限的 Nginx 配置。参见 [个人服务器自动预览](docs/personal-preview.md)。
- 两版简介分别进入 Pagefind 的英文、中文索引；旧地址跳转页、CV 打印页、重复导航与留白模块不参与索引。

## 快速开始

项目使用 Node.js `22.17.0` 和 Hugo Extended `0.161.1`（Hugo 已在 `0.166.0+extended` 验证）。启动前请确保这两个工具已安装。

### 日常开发预览

在终端进入项目根目录并启动：

```bash
cd /Users/lhl/AlongSite
npm ci       # 首次启动或依赖更新后执行，日常启动可跳过
npm run dev
```

上面的目录是当前 Mac 的项目路径；在 Windows 或其他设备上，请改成该设备的仓库路径。如果已经在 IDE 的项目根目录终端中，可以直接运行 `npm run dev`。

默认访问地址：

- 网站入口：<http://localhost:1313/>
- 中文个人简介：<http://localhost:1313/about/>
- 英文个人简介：<http://localhost:1313/en/about/>
- 博客首页：<http://localhost:1313/blog/>
- 文章列表：<http://localhost:1313/writing/>

以终端实际输出的地址和端口为准。保持终端运行，修改项目内的模板、样式或 Markdown 后，页面会自动刷新；停止服务按 `Ctrl + C`。该命令会包含 Hugo 草稿，仅用于本地开发，不会部署到线上。

如果要预览 Obsidian 中刚修改的公开文章，先同步，再启动：

```bash
npm run content:sync
npm run dev
```

`content:sync` 会更新公开快照、项目文章、受管图片和发布清单，也会清理已取消公开的受管文件；不是只读检查。开发服务已经运行时，可另开一个项目终端执行同步，无需每次重启。私人笔记的改动不会直接被 Hugo 监听，需要再次同步。

### 带站内搜索的完整预览

普通 `npm run dev` 不会生成或更新 Pagefind 搜索索引。如果需要测试搜索，改用：

```bash
npm run preview:search
```

该命令会先清理并构建 Hugo 页面，再生成中文和英文搜索索引并启动静态预览服务。访问终端显示的本地地址，不要沿用开发服务的端口。

完整预览不是实时开发服务：修改内容或重新同步文章后，按 `Ctrl + C` 停止，再次运行 `npm run preview:search`，使页面和搜索索引一起更新。

### 只生成静态网页

如果只需要构建、不启动预览服务：

```bash
npm run build
```

构建产物位于 `public/`（包含 `public/pagefind/` 搜索索引），已被 `.gitignore` 排除。构建会清理旧产物，避免取消公开的文章留下旧 HTML；本地启动、同步和构建都不会自动提交 Git 或部署到 Netlify。

## 配置与替换

- 博客顶部展示“今日灵感”：浏览器按本地日期从[一言语句接口](https://developer.hitokoto.cn/sentence/)获取一句话，成功后缓存在本机至次日；接口不可用、禁用 JavaScript 或离线时显示仓库内的静态寄语。页面只用 `textContent` 插入接口文本，不把外部内容当 HTML 执行。
- 博客及阅读页面采用彩色光晕背景和半透明玻璃卡片；配色与模糊程度集中在 `static/css/main.css` 的设计变量及 `.hero`、`.card` 等样式中。
- 站点标题、规范域名、RSS/Sitemap、菜单和 SEO 参数在 `hugo.yaml`。
- 简介姓名和状态文字使用 `data/portfolio.yaml` 的对应语言资料，身份标识及头像分别由 `params.author`、`params.avatar` 配置；默认 `static/images/avatar.svg` 是字形占位头像，替换为自己的照片后同步更新 `params.avatar`。个人简介生活板块的状态标志由 `params.status.emoji` 和 `params.status.text` 控制，例如 `😊 / 开心`、`😢 / 难过`、`🏖️ / 休假中`、`🧋 / 喝奶茶中`；改动配置并重新部署即可让所有访客看到新状态。
- `params.email`、`params.github`、`params.resume` 和 `params.defaultImage` 请在发布前检查并替换为真实公开信息。
- 网站入口布局在 `themes/along/layouts/home.html`，博客布局在 `themes/along/layouts/blog/list.html`，个人简介布局在 `themes/along/layouts/about.html`；通用元信息在 `themes/along/layouts/_partials/head.html`。
- 博客采用“左侧整合栏 + 双列文章瀑布流”：搜索、最近更新、分类、标签和“现在”集中在左侧，文章详情页继续保留右侧目录。首页专用样式和排列逻辑分别在 `static/css/home.css`、`static/js/home.js`；手机端文章按时间顺序单列显示，辅助信息放在列表下方。禁用 JavaScript 时仍可阅读普通网格卡片。
- 博客封面优先使用文章的 `cover` 字段（已发布的图片地址）；没有该字段时，识别正文中带 `banner` 标记的图片，例如 `![banner banner-fade](/images/published/你的图片.png)`。普通插图不会被当作封面，有封面的卡片会自然增高；原文图片仍保留。相对图片路径以文章地址为基准，推荐使用同步脚本生成的 `/images/published/...` 路径。
- 文章页采用高不透明度的阅读面板，正文排版集中在 `static/css/article.css`，代码高亮配色在 `static/css/syntax.css`；外层侧栏与背景继续使用 `main.css` 的玻璃样式。桌面文章目录显示在右侧，较窄屏幕可在正文顶部展开目录。代码块提供语言标识和复制按钮，宽表格在自身区域横向滚动。
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

保存后项目会出现在独立的 Projects 列表中。设置 `featured: true` 后，也会出现在英文个人主页 `/` 和中文简介 `/cn/about` 的 Selected Work / 精选项目区域，`weight` 数字越小越靠前；不需要再往 `data/portfolio.yaml` 重复添加项目。精选项目使用单列宽卡片，展示序号、年份、可选状态、项目简介、技术栈以及可选 GitHub、在线演示入口；卡片随内容自然增高，不强制等高。独立 Projects 列表保留原有布局。标题与简介沿用 Markdown 中的原文，切换简介语言不会自动翻译项目内容。`status`、`stack`、`github` 和 `demo` 可按需填写，例如 `demo: "https://example.com/"`；不填写时不会显示演示链接。

设为 `featured: false` 或移除该字段，只会从个人简介的精选项目中移除，项目详情和 Projects 列表仍然公开。可运行 `npm run dev` 本地预览。

项目直接由网站仓库发布，不走 Obsidian 的 `content:sync` 流程；放进 `content/projects/` 就会公开，`public: false` 不能用来隐藏项目。

## 页面与边界

已包含首页、Writing 分类层级（engineering / essays / life）、Projects、About、Now、Search、404、RSS、Sitemap、robots.txt，以及 canonical、description、Open Graph 和 Twitter Card。Pagefind 只在 `/search/` 页面按需加载，索引 Writing、Projects、About 和 Now 等公开内容详情页。

文章中的普通引用使用紫色引用样式；需要说明、建议或警告时，可以写 Markdown 提示块：

```markdown
> [!NOTE]
> 补充背景或说明。

> [!TIP]
> 一个可以直接尝试的建议。

> [!WARNING]
> 需要留意的操作条件。
```

同时支持 `[!IMPORTANT]` 和 `[!CAUTION]`。提示块由 Hugo 构建为 HTML，关闭 JavaScript 时仍可阅读；复制按钮和目录当前章节高亮属于渐进增强。排版验证样稿保存在 `test/fixtures/article-typography.md`，不作为公开文章发布。

## Pagefind 与 Netlify

生产构建顺序固定为 Hugo → Pagefind：

```bash
npm ci
npm run build
```

Hugo 会先清理并重新生成 `public/`，Pagefind 随后把中文索引写入 `public/pagefind/`。个人简介首页与中文简介各进入对应语言索引；导航、页脚、留白模块、旧地址兼容页、列表页、搜索页和 404 不进入索引，避免重复结果；搜索界面脚本与样式也不会进入首页首屏。

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

### 简介照片、介绍与研究兴趣

- 当前照片为用户此前提供的简历内同一证件照，提取 JPEG 原图保存至 `static/images/portrait.jpg`，不作人像生成或修饰。使用 contain 保留照片完整内容；可随时替换成更高分辨率原图。
- 双语 `profile_intro` 和 `profile_detail` 管理两段简介。未将参考文案中的心理学训练写为个人资历。
- `data/portfolio.yaml` 的各语言可增加 `interests` Markdown 字段填写研究兴趣；未填写时仅显示中英文标题，不输出虚构内容或空白占位文案。
- 简介正文桌面 18px、手机 17px，经历说明 15–16px，并提高字重与文字对比度。

首屏采用文字主导的编辑式布局：桌面照片宽 300px，保留原照片 6:7 比例、靠近姓名顶部对齐，不随介绍增多而放大；平板宽 220px，手机上下排列。简介底部仅提供 GitHub 联系入口。
