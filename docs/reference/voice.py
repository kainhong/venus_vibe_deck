# example requires websocket-client library:
# pip install websocket-client

import time
import json
import threading
import base64
import websocket
import logging
import logging.handlers
from datetime import datetime

logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)

API_KEY = "sk-xx"
QWEN_MODEL = "qwen3-asr-flash-realtime"

if not API_KEY:
    raise ValueError("环境变量 DASHSCOPE_API_KEY 未设置，请先执行 export DASHSCOPE_API_KEY='sk-xxx'")

baseUrl = "wss://a1.tstech.top/v1/realtime"
url = f"{baseUrl}?model={QWEN_MODEL}"
print(f"Connecting to server: {url}")

# 注意： 如果是非vad模式，建议持续发送的音频时长累加不超过60s
enableServerVad = True
connection_ready = threading.Event()

headers = [
    "Authorization: Bearer " + API_KEY,
    "OpenAI-Beta: realtime=v1"
]

def send_event(ws, event):
    logger.info(f" Send event: {event['event_id']}, type={event['type']}")
    ws.send(json.dumps(event))

def init_logger():
    formatter = logging.Formatter('%(asctime)s|%(levelname)s|%(message)s')

    filter = logging.handlers.RotatingFileHandler("omni_tester.log", maxBytes = 100 * 1024 *1024, backupCount = 3)
    filter.setLevel(logging.DEBUG)
    filter.setFormatter(formatter)

    console = logging.StreamHandler()
    console.setLevel(logging.DEBUG)
    console.setFormatter(formatter)

    logger.addHandler(filter)
    logger.addHandler(console)

def on_open(ws):
    logger.info("Connected to server.")
    connection_ready.set()

    event = {
        "event_id": "event_123",
        "type": "session.update",
        "session": {
            "modalities": ["text"],
            "input_audio_format": "pcm",
            "sample_rate": 16000,
            "input_audio_transcription": {
                "language": "zh"
            },
            "turn_detection": {
                "type": "server_vad",
                "threshold": 0.0,
                "silence_duration_ms": 400
            } if enableServerVad else None
        }
    }

    logger.info(f"Sending event: {json.dumps(event, indent=2)}")
    ws.send(json.dumps(event))

def on_message(_, message):
    try:
        data = json.loads(message)
        logger.info(f"Received event: {json.dumps(data, ensure_ascii=False, indent=2)}")
    except json.JSONDecodeError:
        logger.error(f"Failed to parse message: {message}")

def on_error(_, error):
    logger.error(f"Error: {error}")
    connection_ready.clear()

def on_close(_, close_status_code, close_msg):
    logger.info(f"Connection closed: {close_status_code} - {close_msg}")
    connection_ready.clear()

def send_audio(ws, local_audio_path):
    if not connection_ready.wait(timeout=10):
        logger.error("WebSocket 未建立成功，停止发送音频")
        return

    with open(local_audio_path, 'rb') as audio_file:
        logger.info(f"文件读取开始: {datetime.now().strftime('%Y-%m-%d %H:%M:%S.%f')[:-3]}")
        while True:
            if not ws.sock or not ws.sock.connected:
                logger.error("WebSocket 连接已关闭，停止发送音频")
                return

            audio_data = audio_file.read(3200)
            if not audio_data:
                logger.info(f"文件读取完毕: {datetime.now().strftime('%Y-%m-%d %H:%M:%S.%f')[:-3]}")
                if enableServerVad is False and ws.sock and ws.sock.connected:
                    event = {
                        "event_id": "event_789",
                        "type": "input_audio_buffer.commit"
                    }
                    ws.send(json.dumps(event))
                break

            encoded_data = base64.b64encode(audio_data).decode('utf-8')
            eventd = {
                "event_id": "event_" + str(int(time.time() * 1000)),
                "type": "input_audio_buffer.append",
                "audio": encoded_data
            }
            ws.send(json.dumps(eventd))
            logger.info(f"Sending audio event: {eventd['event_id']}")
            time.sleep(0.1)

# 添加连接关闭处理函数
ws = websocket.WebSocketApp(
    url,
    header=headers,
    on_open=on_open,
    on_message=on_message,
    on_error=on_error,
    on_close=on_close
)

init_logger()
logger.info(f"Connecting to local WebSocket server at {url}...")

# 替换为待识别的音频文件路径
local_audio_path = "./test.pcm"
thread = threading.Thread(target=send_audio, args=(ws, local_audio_path))
thread.start()

ws.run_forever()
