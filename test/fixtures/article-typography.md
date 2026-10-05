---
title: "把复杂的知识，写成读得下去的文章"
description: "一份用于验证中文长文、技术代码与 Markdown 元素的排版样稿。"
date: 2026-10-05
tags: [工程笔记, 阅读体验]
---

## 从笔记到文章

好的排版让读者把注意力留在内容上。标题帮助建立结构，段落之间的留白让思路有停顿，代码和表格则需要准确地保留信息。我们希望文章既能容纳技术细节，也能让一段普通的生活记录读起来轻松。

这是 **强调的观点**，也可以用 *斜体* 补充语气。行内代码 `agent.reply(message)` 应当容易辨认，而 [一个普通链接](https://example.com) 应当在长文中保持可见。

### 让信息有层次

1. 先解释问题，以及它为什么值得关注。
2. 再给出过程，把必要的上下文放在读者需要的位置。
   - 一个嵌套的补充说明。
   - 另一个能够帮助理解的例子。
3. 最后回到经验，而不是堆叠结论。

- [x] 完成标题与段落排版
- [ ] 继续记录真实的实践

#### 四级标题：一个细节

这一段用来验证较低层级的标题不会抢走主标题的注意力。

##### 五级标题

###### 六级标题

正文中的脚注可以保留出处，而不打断阅读。[^reference]

## 引用与提示

> 我们阅读，是为了让自己能够看见更多可能。
>
> 引用也可以包含 **强调** 和 `code`，以及第二个段落。

> [!NOTE]
> 一条补充背景：提示框沿用紫色，但正文保持清晰。

> [!TIP]
> 先把关键概念讲清楚，再引入工具和框架。

> [!IMPORTANT]
> 保留源笔记的发布选择，避免把私人内容自动公开。

> [!WARNING]
> 操作前确认目标路径，并核对需要修改的文件。

> [!CAUTION]
> 不要用一次成功的结果代替完整的验证。

## 代码应该忠于原文

```javascript
async function publishArticle(article) {
  const label = "<script>alert('escaped')</script>";
  if (article.public !== true) return;
  return await renderMarkdown(article.body, { label });
}
```

```text
A-long-line-for-horizontal-scroll: source → validation → transformation → snapshot → website → search-index → deploy-preview → production
```

没有语言标记的代码块也应支持复制：

```
npm run content:check
npm run content:sync
```

## 表格是一种比较方式

| 阶段 | 输入 | 输出 | 是否修改源笔记 | 执行频率 | 关注点 |
| :--- | :--- | :---: | :---: | ---: | :--- |
| 元数据补齐 | 私人知识库中的 Markdown | 必要字段与默认值 | 是 | 写作后 | 已有有效值会保留 |
| 内容检查 | 选择公开的文章 | 校验结果 | 否 | 发布前 | 类型、日期、引用与敏感信息 |
| 同步发布 | 通过检查的源文件 | 网站内容、图片和 manifest | 否 | 按需 | 只管理已经登记的输出 |

---

## 一张图片，一次停顿

![图片排版示例](/images/og-default.svg)

按 <kbd>Ctrl</kbd> + <kbd>C</kbd> 复制内容，也可以用 <mark>高亮</mark> 标记一段需要回看的话。

[^reference]: 脚注样式应清楚、紧凑，并且能够返回正文。
