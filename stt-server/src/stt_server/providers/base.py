from abc import ABC, abstractmethod


class STTProvider(ABC):
    @abstractmethod
    async def load(self) -> None:
        """加载模型，服务启动时调用一次"""
        ...

    @abstractmethod
    async def transcribe(self, audio: bytes, sample_rate: int, language: str) -> str:
        """PCM 音频 bytes → 识别文本"""
        ...
