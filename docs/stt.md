# 语音识别（STT）配置

Venus Terminal 支持两种 ASR 提供者，通过环境变量一键切换。

## 提供者切换

在 `.env` 中配置：

```env
# cloud: 云端 ASR（默认）| local: 本地 stt-server
VOICE_ASR_PROVIDER=cloud
```

| 值 | 说明 | 优势 | 要求 |
|------|------|------|------|
| `cloud` | 云端 qwen3-asr-flash-realtime | 无需本地资源、识别质量高 | 需要网络和 API Key |
| `local` | 本地 SenseVoiceSmall | 离线、免费、低延迟、隐私 | 需要 Python 环境 + 2GB 内存 |

## 云端 ASR 配置

```env
VOICE_ASR_PROVIDER=cloud
VOICE_ASR_BASE_URL=wss://dashscope.aliyuncs.com/compatible-mode/v1/realtime
VOICE_ASR_API_KEY=sk-xxx
VOICE_ASR_MODEL=qwen3-asr-flash-realtime
VOICE_ASR_SAMPLE_RATE=16000
VOICE_ASR_TIMEOUT_MS=30000
```

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `VOICE_ASR_BASE_URL` | WebSocket 端点 | `wss://dashscope.aliyuncs.com/compatible-mode/v1/realtime` |
| `VOICE_ASR_API_KEY` | API 密钥 | — |
| `VOICE_ASR_MODEL` | 模型名称 | `qwen3-asr-flash-realtime` |
| `VOICE_ASR_SAMPLE_RATE` | 采样率 | `16000` |
| `VOICE_ASR_TIMEOUT_MS` | 超时时间 | `30000` |

## 本地 ASR 配置

```env
VOICE_ASR_PROVIDER=local
VOICE_LOCAL_ASR_URL=http://127.0.0.1:7000
```

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `VOICE_LOCAL_ASR_URL` | stt-server 地址 | `http://127.0.0.1:7000` |

### 启动本地 ASR 服务

```bash
cd stt-server
./start.sh
```

详细说明见 [stt-server/README.md](../stt-server/README.md)。

## 架构

```
┌──────────────┐    audio    ┌──────────────────────┐
│   browser    │ ──────────► │    Node server       │
│  (录音 PCM)  │             │                      │
└──────────────┘             │  VOICE_ASR_PROVIDER  │
                             │    ├─ cloud ──► qwen realtime WS
                             │    └─ local ──► stt-server (HTTP)
                             └──────────────────────┘
```

切换提供者只需修改 `.env` 中的 `VOICE_ASR_PROVIDER` 并重启服务，业务代码无需变动。

## LLM 文本优化

无论使用哪个 ASR 提供者，识别后的文本都会经过 LLM 清洗（去口语噪音、识别命令），由以下配置控制：

```env
VOICE_LLM_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
VOICE_LLM_API_KEY=sk-xxx
VOICE_LLM_MODEL=qwen-plus
VOICE_LLM_TIMEOUT_MS=30000
```

自定义清洗 prompt 放在 `server/config/voice-refine-prompt.md`。
