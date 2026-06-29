# 移动端原生壳探索

状态：待实现

本文记录 Venus 在 PWA 之外增加移动端原生壳的阶段性判断。当前仅作为后续实现参考，不代表已经开始开发。

## 背景

Venus 当前以 PWA / 移动浏览器为主要入口。PWA 可以满足前台触控、语音输入、WebSocket 控制和 Web Push 通知，但移动系统会限制后台页面：

- 后台或锁屏后，前端 JavaScript、定时器和 WebSocket 可能被冻结。
- PWA 不能可靠监听音量键、电源键等系统按键。
- 后台 TTS、媒体按键、通知动作等能力受浏览器和系统策略限制。

因此，如果要实现更强的移动端控制能力，需要考虑原生 App 或原生壳。

## 结论

优先从 Android 做 PoC。Android 比 iOS 更容易验证移动端原生控制层：

- WebView / Capacitor 壳限制更少。
- 可通过 APK 侧载安装，不必先进入应用商店审核流程。
- Foreground Service、通知栏操作、媒体按键、蓝牙按键等能力更容易接入。
- 调试链路直接，适合快速验证体验价值。

iOS 可以作为后续阶段。公开上架 App Store 时不能只是纯 WebView 套壳，需要提供足够原生价值，否则可能触发审核风险。

## 候选技术

Capacitor 是首选候选方案。

它允许 Venus 继续复用现有 React / PWA 页面，并在外层提供 iOS / Android 原生工程。Web UI 仍然承担主要交互，原生层补足系统能力。

目标结构：

```text
Venus React / PWA 页面
        |
        v
Capacitor WebView
        |
        v
Android / iOS 原生能力
```

## 第一阶段目标

第一阶段不重写 Venus UI，只做 Android 原生壳验证：

- WebView 加载现有 Venus server 页面。
- 原生侧保存 Venus server 地址和基础连接配置。
- Android Foreground Service 保持移动端控制入口。
- 通知栏提供常用操作：
  - 打开 Venus
  - 打开当前 session
  - 停止当前任务
  - 播报最新完成消息
- 复用当前 server 的 HTTP / WebSocket / hooks / TTS 能力。

## 按键能力判断

不建议把音量键或电源键作为第一阶段主控制入口：

- 音量键会和系统音量控制冲突，后台和锁屏行为不稳定。
- 电源键属于系统级按键，不适合作为业务控制入口。
- 无障碍服务虽然能力强，但权限敏感，不适合作为第一阶段默认方案。

更合理的控制入口：

- 通知栏常驻控制按钮。
- 耳机或蓝牙媒体键。
- 蓝牙遥控器按键。
- Android Quick Settings Tile。
- 前台服务状态入口。

## iOS 注意事项

iOS 可以做，但不适合作为第一阶段验证平台：

- 后台保活限制更严格。
- App Store 审核不鼓励纯 WebView 包装网站。
- 如果未来公开上架，需要设计为 Venus Mobile Controller，而不是“打开网页的壳”。

更稳的 iOS 定位：

- 本地保存 server 配置和鉴权状态。
- 提供原生通知、通知动作、TTS 播放控制和生命周期恢复。
- WebView 作为主 UI，原生层提供移动端独有能力。

## 暂不实现

本方向暂时只记录，不进入实现。等需要验证后台控制、通知动作、媒体键或蓝牙按键时，再启动 Android Capacitor PoC。
