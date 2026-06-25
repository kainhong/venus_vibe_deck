# Web Push Notifications

## Goal

When Claude/Codex hooks call the local Notification API, connected foreground pages still receive the existing WebSocket bell feedback. Installed/background PWA clients should additionally receive a system notification through Web Push.

This is for task-completion style alerts only. It is not a general chat or event stream.

## Requirements

- HTTPS is required for mobile/PWA usage. `localhost` is only acceptable for local development.
- User must grant browser notification permission.
- iOS requires the site to be installed as a PWA before Push is reliable.
- No third-party business service is required, but browser push services are still used by the browser vendor.

## Environment

```env
WEB_PUSH_PUBLIC_KEY=...
WEB_PUSH_PRIVATE_KEY=...
WEB_PUSH_SUBJECT=mailto:you@example.com
```

Generate keys once:

```bash
npx web-push generate-vapid-keys
```

If VAPID keys are missing, server should keep WebSocket notification working and skip Web Push.

## HTTP API

```http
GET /api/push/public-key
```

Returns:

```json
{ "publicKey": "..." }
```

```http
POST /api/push/subscribe
Content-Type: application/json
```

Body is the browser `PushSubscription` JSON.

```http
DELETE /api/push/subscribe
Content-Type: application/json
```

Optional first version. Remove by endpoint when provided.

## Storage

Persist subscriptions in local server data:

```text
~/.venus-hube/push-subscriptions.json
```

Invalid subscriptions should be removed when push send returns 404 or 410.

## Notification Flow

1. Claude/Codex hook calls local-only `POST /api/notification`.
2. Server broadcasts existing WebSocket `terminal_bell`.
3. Server also sends Web Push to stored subscriptions when VAPID is configured.
4. Service Worker receives `push` and calls `showNotification`.

Payload:

```json
{
  "title": "Venus",
  "body": "任务完成",
  "source": "claude",
  "sessionId": "optional",
  "at": 123456789
}
```

## Frontend Behavior

- On app load, register `sw.js`.
- If Push is supported and permission is granted, subscribe and send subscription to server.
- If permission is `default`, the first implementation may request permission automatically from a user gesture later; for now the settings screen can show status and users can grant permission through browser UI.
- Foreground page does not need a toast; WebSocket bell keeps the lightweight sound/vibration behavior.
- Background/PWA notification is handled by the Service Worker.

## Service Worker Behavior

On push:

```js
self.registration.showNotification(title, {
  body,
  tag: sessionId || 'venus-agent',
  renotify: true,
  icon: '/icon-192.png',
  badge: '/icon-192.png'
});
```

On notification click:

- Close notification.
- Focus an existing client if present.
- Otherwise open `/`.

test:
```shell
curl -s -X POST http://127.0.0.1:8001/api/notification \
    -H "Content-Type: application/json" \
    -d '{"source":"test","message":"Web Push 测试"}'
```