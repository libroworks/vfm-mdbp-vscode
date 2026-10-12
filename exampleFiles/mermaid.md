---
title: Mermaidの図版テスト
lang: ja
---

# フローチャート

```mermaid
flowchart LR
  A[原稿を作成] --> B[HTMLへ変換]
  B --> C[プレビュー]
  B --> D[PDFを生成]
```

# シーケンス図

```mermaid
sequenceDiagram
  participant Author as 著者
  participant CLI as Vivliostyle CLI
  Author->>CLI: 原稿を保存
  CLI->>CLI: MermaidをSVGへ変換
  CLI-->>Author: 紙面を表示
```
