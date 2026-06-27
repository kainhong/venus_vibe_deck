# STT Server 镜像 —— 本地 SenseVoiceSmall 语音识别(默认 CPU 推理)
# 模型 1.7G 不打包:运行时挂载 models/ 或让 FunASR 首次联网下载到 MODELSCOPE_CACHE
#
# 构建:  docker build -t venus-stt-server:latest .
# 运行:  docker run --rm -p 7000:7000 -v "$PWD/models":/app/models \
#              -e STT_MODEL=./models/iic/SenseVoiceSmall venus-stt-server:latest
# 或用同目录 docker-compose.yml

FROM python:3.11-slim

# 系统依赖:
#   build-essential —— 个别 wheel 需现场编译
#   libsndfile1 / ffmpeg —— 音频解码
#   git —— funasr trust_remote_code 可能拉模型仓库
#   curl —— HEALTHCHECK
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        libsndfile1 \
        ffmpeg \
        git \
        curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# uv:依赖安装比 pip 快很多(若拉取 ghcr.io 受限,可改用 `RUN pip install uv`)
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

# 先拷依赖清单 + 源码,利用层缓存(pyproject 不变则跳过昂贵的 torch/funasr 安装)
COPY pyproject.toml ./
COPY src ./src
RUN uv pip install --system -e .

# 运行时配置(端口对齐 README/start.sh 的 7000;host 暴露给容器网络)
ENV STT_HOST=0.0.0.0 \
    STT_PORT=7000 \
    STT_DEVICE=cpu \
    MODELSCOPE_CACHE=/app

EXPOSE 7000
# 模型目录:运行时挂载;-e STT_MODEL=./models/iic/SenseVoiceSmall 指向本地模型,避免联网下载
VOLUME ["/app/models"]

# 模型首次加载耗时,start-period 给足预热时间
HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
    CMD curl -fsS "http://127.0.0.1:${STT_PORT}/health" || exit 1

CMD ["sh", "-c", "uvicorn stt_server.main:app --host ${STT_HOST} --port ${STT_PORT}"]
