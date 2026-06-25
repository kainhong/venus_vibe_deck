# TTS 语音合成配置

Venus Terminal 集成了 Edge TTS 语音合成服务，基于微软在线 TTS，免费、无需 API Key。

## 环境变量

在 `.env` 中配置：

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `VOICE_TTS_ENABLED` | 是否启用 TTS 服务 | `false` |
| `VOICE_TTS_VOICE` | 音色名称 | `zh-CN-XiaoxiaoNeural` |
| `VOICE_TTS_RATE` | 语速调节（相对百分比） | `+0%` |
| `VOICE_TTS_VOLUME` | 音量调节（相对百分比） | `+0%` |

## 音色列表

常用中文音色：

| 音色 | 性别 | 风格 |
|------|------|------|
| `zh-CN-XiaoxiaoNeural` | 女 | 活泼、温暖（默认） |
| `zh-CN-XiaoyiNeural` | 女 | 温柔、亲切 |
| `zh-CN-YunjianNeural` | 男 | 沉稳、专业 |
| `zh-CN-YunxiNeural` | 男 | 阳光、清晰 |
| `zh-CN-YunxiaNeural` | 男 | 少年感 |
| `zh-CN-YunyangNeural` | 男 | 新闻播报 |

英文音色：

| 音色 | 性别 | 风格 |
|------|------|------|
| `en-US-JennyNeural` | 女 | 通用 |
| `en-US-GuyNeural` | 男 | 通用 |
| `en-US-AriaNeural` | 女 | 表达力丰富 |

## 语速和音量

支持相对调节：

- 加速：`+20%`、`+50%`
- 减速：`-20%`、`-50%`
- 音量增大：`+30%`
- 音量减小：`-30%`

## 示例配置

```env
VOICE_TTS_ENABLED=true
VOICE_TTS_VOICE=zh-CN-YunjianNeural
VOICE_TTS_RATE=+10%
VOICE_TTS_VOLUME=+0%
```

## API 接口

启用后可通过 HTTP 接口直接调用：

```bash
curl -X POST http://localhost:8001/api/tts \
  -H "Content-Type: application/json" \
  -d '{"text":"你好，这是语音合成测试"}' \
  --output output.mp3
```

返回 `audio/mpeg` 格式的 MP3 音频流。
