# STT Server — 本地语音识别服务

基于 [SenseVoiceSmall](https://huggingface.co/FunAudioLLM/SenseVoiceSmall) 的本地离线语音识别服务，通过 HTTP 接口为 Venus Vibe Deck 提供 ASR 能力。

## 特性

- 离线运行，无需网络
- CPU 推理，无需 GPU（RTF < 0.1，10s 音频约 1s 处理）
- 支持中文、粤语、英文、日文、韩文
- 模型自动下载缓存

## 模型下载

首次启动时 FunASR 会自动从 ModelScope 下载模型。如果网络不稳定，可以手动下载后放到 `models/` 目录：

- **ModelScope**：https://modelscope.cn/models/iic/SenseVoiceSmall
- **HuggingFace**：https://huggingface.co/FunAudioLLM/SenseVoiceSmall

手动下载后设置环境变量指向本地路径：

```bash
STT_MODEL=./models/SenseVoiceSmall ./start.sh
```

## 环境要求

- Python 3.11+
- [uv](https://github.com/astral-sh/uv) 包管理工具
- 内存 ≥ 2GB（模型加载约 1GB）

## 快速启动

```bash
cd stt-server
./start.sh
```

首次运行会自动：
1. 创建 `.venv` 虚拟环境
2. 安装依赖（funasr、torch 等）
3. 下载 SenseVoiceSmall 模型（约 500MB，仅首次）
4. 启动服务（默认 `127.0.0.1:7000`）

## 配置

通过环境变量配置：

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `STT_HOST` | 监听地址 | `127.0.0.1` |
| `STT_PORT` | 监听端口 | `7000` |
| `STT_MODEL` | FunASR 模型 ID | `iic/SenseVoiceSmall` |
| `STT_DEVICE` | 推理设备 | `cpu` |

如有 GPU 可设 `STT_DEVICE=cuda`。

## API

### GET /health

健康检查。

```bash
curl http://127.0.0.1:7000/health
# {"status":"ok"}
```

### POST /transcribe

语音识别。

**请求体：**

```json
{
  "audio": "<base64 编码的 PCM 音频>",
  "sample_rate": 16000,
  "language": "zh"
}
```

- `audio`：16bit PCM 音频的 base64 编码
- `sample_rate`：采样率（默认 16000）
- `language`：语言代码（`zh`/`en`/`yue`/`ja`/`ko`）

**响应：**

```json
{
  "text": "识别出的文本",
  "duration_ms": 850
}
```

### 示例

```bash
# 录制 3 秒音频并识别
arecord -f S16_LE -r 16000 -d 3 /tmp/test.pcm
curl -X POST http://127.0.0.1:7000/transcribe \
  -H "Content-Type: application/json" \
  -d "{\"audio\":\"$(base64 /tmp/test.pcm)\",\"sample_rate\":16000,\"language\":\"zh\"}"
```

## 与 Venus Vibe Deck 集成

在项目根目录 `.env` 中切换 ASR 提供者：

```env
VOICE_ASR_PROVIDER=local
VOICE_LOCAL_ASR_URL=http://127.0.0.1:7000
```

设为 `cloud` 则使用云端 ASR（默认），设为 `local` 则路由到本地 stt-server。

## 扩展 Provider

如需接入其他 ASR 引擎，在 `src/stt_server/providers/` 下新建实现类，继承 `STTProvider`：

```python
from .base import STTProvider

class MyProvider(STTProvider):
    async def load(self) -> None:
        # 加载模型
        ...

    async def transcribe(self, audio: bytes, sample_rate: int, language: str) -> str:
        # PCM bytes → 文本
        ...
```

然后在 `main.py` 中替换 provider 实例即可。
