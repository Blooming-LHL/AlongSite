---
title: "ALong Site · 内容发布系统"
slug: along-site
description: "连接 Obsidian 写作与静态网站发布，用显式公开标记、内容校验和自动化构建管理发布边界。"
date: 2026-11-03
status: "持续迭代"
stack: ["Hugo", "JavaScript", "Node.js", "Pagefind"]
github: "https://github.com/Blooming-LHL/AlongSite"
featured: true
weight: 10
---

## 问题

私人知识库与公开网站之间需要明确边界。文章、图片和元数据应保持同步，也需要避免把未公开笔记或本地路径带到网站。

## 系统流程

```text
Obsidian Blog
  → public: true 筛选
  → 元数据与内容校验
  → 暂存与同步
  → Hugo 静态构建
  → Pagefind 中文索引
  → Netlify 发布
```

## 工程设计

- **显式发布**：仅接受 YAML 布尔值 `public: true`；未声明公开的笔记不会被同步。
- **路径边界**：只复制文章引用且真实路径位于知识库内的附件。
- **可靠同步**：通过 manifest 记录受管文件；暂存后再替换，失败时回滚。
- **渐进增强**：正文与导航由静态 HTML 提供，浏览器脚本增强搜索、目录和代码复制。
- **构建顺序**：先构建 Hugo，再为生成的页面创建 Pagefind 索引。

## 取舍

静态网站降低运行时维护成本；搜索索引随构建生成，内容更新需要重新构建。外部每日寄语不可用时，博客仍显示本地静态文案。

这是本站真实源码的工程案例；不包含未经测量的性能指标或用户规模。
