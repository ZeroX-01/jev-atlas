# JEV Atlas design

## Direction

开发者坐在明亮的桌面环境里浏览真实案例，希望迅速看清项目内容、找到源代码。采用清晰的白底目录界面，借鉴 TypeSafe 的大字、细线和计算图形。

References:
- https://render.qmuse.pub/p/muse/8079593307628562/index.html — case index, authors, source attribution, native video.
- https://typesafe.ai/ — black typography, pixel graphics, fine rules.

## Palette and typography

Restrained strategy. Pure white `oklch(1 0 0)`, near black `oklch(.2 0 0)`, neutral secondary text `oklch(.49 0 0)`, lines `oklch(.90 0 0)`. Olive primary `oklch(.49 .11 130)` limited to status and selections. Pale green `oklch(.95 .025 130)` for selected filters.

DM Sans and Noto Sans SC for display and controls. IBM Plex Mono for tiny technical captions, dates and numeric counters. Main Chinese headline 60px desktop, 40px mobile. Body 14–16px. Controls 13px minimum.

## Layout

1240px max content width, 40px desktop outer margins. 80px header. Hero uses left text/right native computational field, one primary action and one secondary resource link. 3-column gallery with 24px gaps, real video frames at 16:10. Open card bodies with no outer shadow or border. Fine horizontal rules separate major sections.

Hero copy: `让灵感，进入执行。` / `看看大家，正在用 JEV 做什么。` / `汇集全球开发者的真实探索。视频演示、图文分享与开源项目，为你的下一个想法找到起点。`

Navigation: 探索案例 / 精选专题 / 我的收藏 / 关于 JEV / 收录案例.

Gallery: 发现，正在发生。 Search, content tabs, category buttons, sort, platform, grid/list. Media controls are native. No fabricated screenshots or generated images presented as real projects.

## States

Search, filter, empty results, saved empty, list view, themed collections, native detail dialog, add-personal-case dialog, source-loading error and retry, export, import and toast feedback. All dialogs trap focus using native dialog and close with Escape. URL hashes address individual cases.

Personal additions and bookmarks live in the current browser; the form and saved page explain the scope. No implied server submission.

Continuous collection adds a restrained native disclosure above the footer: last check, added count, per-source completion/errors. Cards from automated discovery show `自动收录 · 待核验`. `最近收录` sorts by first-seen time. Background refresh preserves active searches, filters and open details; a failed refresh retains existing results.

## Responsive and motion

3 columns desktop, 2 tablet, 1 narrow mobile. Hero collapses on mobile and compact artwork retains visual identity. 160–220ms hover feedback. Native pixel artwork updates at a low frame rate only in view and is static under reduced motion.

## Implementation deviations

The image-generation endpoint twice returned its own “image is generating” placeholder rather than a concept. Those images are not shipped. The actual TypeSafe reference and this written system guide implementation. Native canvas supplies finished computational artwork instead of an unavailable generated asset. This is a deliberate interactive graphic, not a case screenshot.
