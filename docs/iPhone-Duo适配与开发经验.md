# iPhone Duo 适配与开发经验

本文档记录本项目针对 Apple 首款折叠屏设备 **iPhone Duo**（搭载 iOS 27+）在移动端视图下的适配规范、调试踩坑复盘与实现细节，用于固化团队开发经验，避免在后续姿态迭代中重复踩坑。

---

## 一、 设备背景与当前适配状态

- **目标设备**：Apple iPhone Duo（外屏 5.4 英寸 + 内屏 7.6 英寸超视网膜 XDR 屏）。
- **当前完成姿态**：
  1. **外屏闭合竖屏态（Closed / Portrait，Compact Width）**。
  2. **外屏闭合横屏态（Closed / Landscape，Compact Height，转轴置顶模式）**。
- **其他姿态状态**：展开大屏态、桌面悬停态等目前待后续逐步推进，当前已确保外屏双姿态达到像素级原生标准。

---

## 二、 Apple HIG 官方核心设计原则

1. **共享栏区域（Shared Bar Area / Trailing Edge）**
   - 由于 iPhone Duo 外屏比例较宽较矮，若继续沿用传统顶部+底部横向栏，会严重压缩正文纵向阅读高度。
   - 系统在闭合态下将**状态栏（灵动岛/时间/网络信号）、工具栏以及标签页栏（Tab Bar）**统一重构为单列，垂直停靠在屏幕的侧边（默认 Trailing Edge，即右手侧）。
2. **垂直层级次序**
   - 侧边栏由上至下严格依序为：`摄像头 / 灵动岛` → `精简状态栏（时间、WiFi 信号）` → `标签页栏（Tab Bar）`。
3. **内容避让与尺寸分类**
   - 外屏呈现紧凑宽度（Compact Width），内屏呈现常规宽度（Regular Width）。
   - 严禁写死设备宽度，正文容器必须依据安全区（Safe Area Insets）进行单侧弹性避让。

---

## 三、 关键踩坑复盘与教训（避坑指南）

在本次适配外屏姿态的过程中，经历了四个典型误区，必须牢记其成因与解决逻辑：

### 坑 1：误将侧边栏做成“浮动胶囊卡片（Floating Pill）”

- **错误表现**：给导航栏添加了白色背景框、边框与投影，并使用 `right: max(10px, env(safe-area-inset-right))`，导致整个菜单浮在内容卡片上方，遮挡了下拉框和按钮。
- **根本原因**：把系统级侧边栏误解成了应用内的浮动操作按钮（FAB）。在 HIG 规范中，右侧一列本身就是与系统共用的侧边栏专属区域，应当是半透明或透明的原生侧边列，与左侧内容区域互不重叠。
- **纠正**：移除浮动外壳与阴影，将菜单贴紧右侧专属栏内；主内容容器（`.mobile-shell`）留出对应右侧安全边距。

### 坑 2：未启用 `viewport-fit=cover` 导致 WebKit 视口被安全区拦截

- **错误表现**：CSS 中写了 `position: fixed; right: 0;`，但导航栏死死卡在距离屏幕右边缘还有约 130px 宽的地方（x≈580），死活进不去右侧侧边栏（x≈667）。
- **根本原因**：iOS WebKit 的安全区保护机制。若 `<meta name="viewport">` 中未显式包含 `viewport-fit=cover`，WebKit 默认会将整个网页视口限制在安全区内（`viewport-fit: auto`）。此时 `right: 0` 只是安全区左边界，且 CSS 中的 `env(safe-area-inset-*)` 全部被置为 `0px`。
- **纠正**：在 `index.html` 和 `mobile-viewport.ts` 中强制注入 `viewport-fit=cover`，解锁全屏边缘渲染。

### 坑 3：忽略灵动岛（Dynamic Island）在侧边的展开高度

- **错误表现**：为了让菜单挨着状态栏，将 `top` 设为紧贴静态 WiFi 图标下方（136px ~ 168px），导致灵动岛展开时顶部按钮被遮盖。
- **根本原因**：灵动岛不仅有静态指示器，在后台有通话、音乐播放、计时器、打车或外卖等实时活动（Live Activities）时，会沿着右侧栏纵向向下动态展开，展开态高度可达 **180pt ~ 220pt**。
- **纠正**：设置 `top: max(240px, calc(50% - 130px));`，为灵动岛保留至少 240px 的安全净空；同时正好将导航栏带入屏幕垂直中段（右手拇指自然微屈的热区），提升单手盲操体验。

### 坑 4：CSS 绝对定位中的坐标方向反向混淆

- **错误表现**：肉眼发现按钮偏右需要向左微调时，误将 `right` 从 29px 减小至 11px，导致按钮反而更加贴紧右侧边框。
- **根本原因**：在 `position: fixed; right: ...` 中，`right` 是**距屏幕右边缘的距离**。数值越小越靠近右侧；要让元素向左移动，必须**增大** `right` 偏移量。
- **纠正**：精确测量摄像头与右边框的像素差，通过 `29px (边距) + 21px (按钮半宽) = 50px (中轴)` 准确锁定同轴线。

### 坑 5：横屏双向旋转后硬件摄像头翻转与固定高度挤压截断

- **错误表现**：
  1. **转轴在顶（顺时针 90°）**：导航栏固定在 `top: 240px`，下半部分的“配队”、“同步”按钮撞上翻转至右下角的物理摄像头，并溢出到底部黑边外；
  2. **转轴在底（逆时针 90°）**：硬件摄像头转至左上角，右侧虽然无摄像头，但导航栏依然从 `top: 240px` 起步，导致最下方的“同步”按钮被屏幕底边硬生生截断一半。
- **根本原因**：
  1. 竖屏时设置 `top: max(240px, ...)` 是为了躲避右上角灵动岛向下延伸的展开区；
  2. 无论是向哪个方向横转，屏幕垂直可用高度都会从 700pt+ 剧烈压缩至仅 **390pt ~ 420pt**；
  3. 在如此矮的视口中，任何大于 200px 的 `top` 偏移都会导致总高约 250px 的导航栏直接触底甚至溢出。
- **纠正**：
  1. 通过 `@media (orientation: landscape), (max-height: 560px)` 自动识别横屏紧凑高度姿态，采用 **JS 动态姿态监听器 (`detectDevicePosture`)** 为 `<html>` 注入精确的 `data-posture` 属性；
  2. **姿态 A（顺时针 90°，转轴在顶，摄像头在右下角）**：
     - 设置 `top: auto; bottom: max(60px, calc(env(safe-area-inset-bottom) + 38px));`，摄像头顶部距离屏幕底边约为 52.5pt，保留 7.5pt 黄金间隙紧贴吸附于摄像头正上方；
     - 保持 `right: 29px` 与右侧摄像头同轴。
  3. **姿态 B（逆时针 90°，转轴在底，摄像头在左上角）**：
     - 摄像头在左上，距离左边框中轴 50px（与竖屏右侧同理）；右侧为平边。
     - 响应“挪到左边，和顶部原点对齐，位置在下面，不用贴着原点”：
       - **水平同轴对齐**：设置 `left: 29px; right: auto;`，按钮半宽 21px，中轴线精确锁定在 X = 50px，与左上角物理摄像头圆点垂直严格同轴；
       - **垂直底部沉底**：设置 `top: auto; bottom: max(16px, env(safe-area-inset-bottom));`，停靠在左下角，不贴着原点；
       - **内容避让互换**：`.mobile-shell` 改为左避让 `padding-left: calc(14px + max(64px, env(safe-area-inset-left)))`，右侧释放为 `padding-right: max(18px, env(safe-area-inset-right))`，卡片自然铺展至右侧平边。

---

## 四、 当前姿态（外屏折叠态）最终技术落地

### 1. 视口全屏配置

- **文件**：`index.html` 与 `src/shared/utils/mobile-viewport.ts`
- **配置**：
  ```html
  <meta
    name="viewport"
    content="width=device-width, initial-scale=1.0, minimum-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover"
  />
  ```

### 2. 侧边栏与主布局样式 (`src/mobile/mobile.css`)

```css
/* 1. 主容器避让右侧侧边栏，正文列表畅通滑到底部 */
.mobile-shell {
  max-width: 760px;
  margin: 0 auto;
  min-height: 100dvh;
  padding: max(20px, env(safe-area-inset-top)) calc(14px + max(56px, env(safe-area-inset-right)))
    max(24px, env(safe-area-inset-bottom)) max(18px, env(safe-area-inset-left));
  position: relative;
}

/* 2. 侧边栏精准中轴对齐与避让灵动岛展开 */
.mobile-nav {
  position: fixed;
  right: 29px; /* 29px 边距 + 21px 按钮半宽 = 50px 绝对中轴，与上方摄像头、时间、WiFi 100% 同轴 */
  width: 42px;
  top: max(240px, calc(50% - 130px)); /* 留出 240px 避让展开态灵动岛，同时落位大拇指操作区 */
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 4px 0;
  background: transparent;
  border: none;
  box-shadow: none;
  z-index: 90;
  user-select: none;
  -webkit-user-select: none;
}

@media (min-width: 820px) {
  .mobile-nav {
    right: calc((100vw - 760px) / 2 + 29px);
  }
}

/* 3. 紧凑型按钮项（图标 17px + 标签 10.5px） */
.mobile-nav button {
  border: 0;
  background: transparent;
  color: #626e78;
  width: 42px;
  min-height: 42px;
  padding: 4px 2px;
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  font-size: 10.5px;
  font-weight: 500;
  line-height: 1;
  white-space: nowrap;
  transition: all 0.15s ease-out;
  -webkit-tap-highlight-color: transparent;
}

.mobile-nav button.active {
  color: #ffffff;
  background: #1c3547;
  font-weight: 600;
  box-shadow: 0 2px 6px rgba(28, 53, 71, 0.2);
}

/* 4. 横屏/紧凑高度通用紧凑样式（默认停靠左下角，与左上角摄像头同轴） */
@media (orientation: landscape), (max-height: 560px) {
  .mobile-shell {
    padding-left: calc(14px + max(64px, env(safe-area-inset-left)));
    padding-right: max(18px, env(safe-area-inset-right));
  }
  .mobile-nav {
    top: auto;
    left: 29px; /* 与左上角摄像头圆点 100% 同轴对齐 */
    right: auto;
    bottom: max(16px, env(safe-area-inset-bottom)); /* 沉底吸附在左下方 */
    gap: 6px;
  }
  .mobile-nav button {
    width: 42px;
    min-height: 38px;
    height: 38px;
    padding: 3px 2px;
    gap: 1px;
    font-size: 10px;
  }
  .mobile-nav button svg {
    width: 15px;
    height: 15px;
  }
}

/* 姿态 A：外屏横屏（顺时针 90°，转轴置顶，摄像头右下） */
[data-posture="landscape-hinge-top"] .mobile-shell {
  padding-left: max(18px, env(safe-area-inset-left));
  padding-right: calc(14px + max(56px, env(safe-area-inset-right)));
}
[data-posture="landscape-hinge-top"] .mobile-nav {
  left: auto;
  right: 29px;
  bottom: max(60px, calc(env(safe-area-inset-bottom) + 38px)); /* 紧贴右下角摄像头上方 */
  top: auto;
}

/* 姿态 B：外屏横屏（逆时针 90°，转轴置底，摄像头左上） */
[data-posture="landscape-hinge-bottom"] .mobile-shell {
  padding-left: calc(14px + max(64px, env(safe-area-inset-left)));
  padding-right: max(18px, env(safe-area-inset-right));
}
[data-posture="landscape-hinge-bottom"] .mobile-nav {
  left: 29px; /* 与顶部左上角摄像头原点对齐 */
  right: auto;
  bottom: max(16px, env(safe-area-inset-bottom)); /* 沉底吸附于左下角底边，不贴着原点 */
  top: auto;
}
```

---

## 五、 后续待适配姿态规划清单（逐步演进）

当前仅完成外屏闭合姿态。以下姿态在后续阶段逐步跟进，切忌直接套用外屏硬编码：

1. **完全展开姿态（Unfolded / 7.6 英寸内屏，Regular Width）**
   - 尺寸类别转变为 Regular Width。
   - 视图应由单列列表自动升级为“双栏/主从视图（Master-Detail）”或网格，充分发挥大屏密度。
   - 严格规避中间铰链与折痕保留区（Reserved Regions），核心操作不可横跨中轴。
2. **半折叠桌面 / 笔记本姿态（Tabletop / Laptop Mode）**
   - 设备弯折约 90 度平放时，上屏为内容/数据/详情看板，下屏自适应为控制器、筛选器或表单。
3. **开合状态连续性（Continuity）**
   - 用户在翻开与合上屏幕的瞬间，保持当前选中的 Tab、滚动位置（Scroll Position）、已筛选状态与抽屉展开状态不丢失。
