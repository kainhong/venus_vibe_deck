import 'dotenv/config';
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { config } from './config.js';
import { SessionManager } from './session/SessionManager.js';
import { ClientConnection } from './ws/handler.js';
import { serveStatic } from './static.js';
import { handleApi } from './http/router.js';
import { createLogger } from './logger.js';

const manager = new SessionManager();
const logger = createLogger('server');

// 单进程:同一 http server 既托管 client 静态页、又承载 WebSocket(同源同端口)。
// 页面与 WS 共用 http://host:port,前端无需关心跨端口/跨域。
const httpServer = createServer(async (req, res) => {
  // API 路由必须先于静态托管:static.ts 的 SPA fallback 会吞掉任何未命中的 /api/* 路径
  if (await handleApi(req, res, manager)) return;
  await serveStatic(req, res);
});

const wss = new WebSocketServer({ server: httpServer });
wss.on('connection', (ws) => {
  new ClientConnection(ws, manager);
});

httpServer.listen(config.port, config.host, () => {
  logger.info('server started', {
    host: config.host,
    port: config.port,
    defaultCommand: config.defaultCommand,
    voiceServerEnabled: config.voice.useServerVoice,
  });
});

// 优雅关闭:收到信号时终止所有 PTY
function shutdown(signal: string) {
  logger.info('shutdown requested', { signal });
  manager.shutdown();
  process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
