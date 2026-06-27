```shell
cd ./stt-server

  .venv/bin/python test/test_asr.py

  #指定某个音频：

  .venv/bin/python test/test_asr.py data/voice/2026-06-27T12-09-13.wav

  #只看本地 stt-server，不跑阿里云：

  .venv/bin/python test/test_asr.py --skip-cloud

  #如果你要看准确率指标，可以加标准文本：

  .venv/bin/python test/test_asr.py --expected "你的标准文本"

  #阿里云配置在：

  stt-server/test/.env

  #脚本会输出本地识别、阿里云识别，以及两者相似度对比。

  ```