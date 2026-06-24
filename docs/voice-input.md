# Voice Input Plan

> 本文档定义语音输入的产品语义、接口结构和分阶段实现方案。当前阶段目标是先用 Web Speech API 快速跑通效果,后续再单独做本地 WASM 与后端 provider 的技术探索。

## Goals

- 在移动端通过语音向当前 PTY 会话输入自然语言文本。
- 第一版优先验证可用性和交互手感,不引入复杂模型加载或后端 provider。
- 保持 provider 可扩展,后续支持 OpenAI 协议兼容的后端语音服务、本地 WASM 模型等。
- 前端不接触后端 provider API key;涉及 key 的调用只能由后端完成。

## Result Contract

所有语音识别 provider 输出统一结构:

```ts
export type SpeechResult =
  | {
      type: 'text';
      message: string;
      confidence?: number;
      provider?: string;
      durationMs?: number;
    }
  | {
      type: 'command';
      message: string;
      command: 'submit' | 'escape' | 'interrupt' | 'up' | 'down' | 'space';
      confidence?: number;
      provider?: string;
      durationMs?: number;
    };
```

当前阶段只产生 `type: 'text'`。`command` 结构先保留,但不做语音命令解析。

## Send Behavior

语音识别完成后有两种发送模式:

| Mode | Behavior | Default |
|---|---|---|
| `insert` | 只把 `message` 写入当前 PTY,不自动回车 | Yes |
| `submit` | 写入 `message`,然后追加 `\r` 执行 | No |

默认不自动回车,避免语音误识别直接触发高风险命令。

## Interaction

语音按钮同时支持两种操作:

- **长按录音**: `pointerdown` 开始识别/录音,`pointerup` 或 `pointercancel` 结束并发送结果。移动端优先使用。
- **点击切换**:第一次点击开始,第二次点击结束。用于桌面端或不方便长按的场景。

交互状态:

| State | UI |
|---|---|
| idle | 常规语音按钮 |
| listening | 语音按钮高亮,可显示简短状态如“听写中” |
| processing | 禁用重复触发,等待识别结果 |
| error | 短暂提示错误,不影响会话 |

## Provider Modes

### 1. `browser-native` - Current First Step

使用浏览器 `SpeechRecognition` / `webkitSpeechRecognition` 快速验证体验。

优点:
- 无后端依赖。
- 实现成本低。
- 可以快速判断语音输入是否适合当前 HUD 交互。

限制:
- iOS Chrome 仍受 iOS WebKit 限制,不能按桌面 Chrome/Android Chrome 判断稳定性。
- 浏览器原生识别可能依赖系统或浏览器服务,不保证离线。
- Safari/iOS 可能需要系统听写或麦克风权限;PWA/Home Screen/WebView 场景可能不可用。

失败策略:
- 如果当前浏览器无 `SpeechRecognition` 能力,语音按钮提示“当前浏览器不支持本地识别”。
- 不自动降级到后端,除非用户在设置中选择后端 provider。

### 2. `server-openai-compatible` - Later

前端用 `MediaRecorder` 录音,上传音频到后端:

```http
POST /api/speech/transcribe
Content-Type: multipart/form-data
```

后端调用 OpenAI 协议兼容 provider,返回 `SpeechResult`。API key 只保存在后端配置或环境变量中。

建议配置字段:

```ts
interface SpeechProviderConfig {
  id: string;
  name: string;
  type: 'openai-compatible';
  baseUrl: string;
  apiKeyEnv?: string;
  model: string;
  isDefault: boolean;
}
```

### 3. `local-wasm` - Technical Exploration

候选路线:

- `Transformers.js` + Whisper/Moonshine 类 ASR 模型。
- `whisper.cpp` WASM/WebGPU。

预期成本:
- 包体和模型体积较大,但本项目可接受。
- 必须使用 Web Worker,避免阻塞 UI。
- 模型需缓存,首次加载要显示进度。
- 移动端耗电和发热会增加,但短语音输入场景可接受。

该模式不进入当前实现任务,后续单独开技术探索。

## Settings

建议配置:

```ts
interface VoiceSettings {
  mode: 'browser-native' | 'server-openai-compatible' | 'local-wasm' | 'off';
  submitMode: 'insert' | 'submit';
  language: string; // default: 'zh-CN'
}
```

当前实现只需要:

```ts
mode: 'browser-native';
submitMode: 'insert';
language: 'zh-CN';
```

## First Implementation Scope

第一阶段只做:

1. 前端封装 `browser-native` provider。
2. 语音按钮支持长按和点击切换。
3. 识别结果按 `SpeechResult` 结构流转。
4. 默认 `insert` 模式,不自动回车。
5. 出错时显示简短提示,不关闭 session,不影响 PTY。

第一阶段不做:

- 后端上传音频。
- OpenAI provider。
- WASM 模型。
- 语音命令解析。
- 复杂设置页;如需配置,先用代码默认值。

## References

- MDN SpeechRecognition: https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition
- WebKit SpeechRecognition limitation: https://bugs.webkit.org/show_bug.cgi?id=225298
- whisper.cpp WASM demo/model sizes: https://ggml.ai/whisper.cpp/
- Transformers.js browser inference: https://huggingface.co/docs/transformers.js/en/index
