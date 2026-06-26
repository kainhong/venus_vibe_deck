# Venus Vibe Deck User Guide

This guide explains how to run Venus Vibe Deck and use its mobile terminal, session, voice, and control features.

## 1. Start the Server

Install dependencies:

```bash
npm install
```

Build and start:

```bash
npm run build
npm run start
```

Or use the helper script:

```bash
./start.sh
./start.sh status
./start.sh log
./start.sh stop
```

Open the app on your phone:

```text
http://<server-lan-ip>:8001
```

The server hosts both the web app and WebSocket endpoint on the same host and port.

## 2. Basic Configuration

Create a `.env` file from `.env.example`.

Common options:

```env
HOST=0.0.0.0
PORT=8001
PTY_COMMAND=bash
PTY_ARGS=
SCROLLBACK_BYTES=51200
VENUS_DATA_DIR=
```

If `VENUS_DATA_DIR` is not set, runtime data is stored at:

```text
~/.venus-vibe-deck
```

Use `HOST=0.0.0.0` when accessing the app from another device on the LAN.

## 3. Configure CLI Profiles

Open **More → Settings**.

Each CLI profile contains:

| Field | Meaning | Example |
|---|---|---|
| Name | Display name | `Claude` |
| Command | Executable command | `claude` |
| Arguments | Startup arguments | `--dangerously-skip-permissions` |
| Resume argument | CLI resume flag | `-c` |
| Default | Preselected profile for new sessions | enabled |

Examples:

```text
Name: Claude
Command: claude
Arguments: --dangerously-skip-permissions
Resume argument: -c
```

```text
Name: Bash
Command: bash
Arguments:
Resume argument:
```

Settings are persisted by the server and shared across devices using the same server.

## 4. Create a Session

Tap the **+** button in the header.

1. Select a CLI profile.
2. Choose or enter a workspace path.
3. Optionally enable resume if the selected CLI profile has a resume argument.
4. Tap **Create**.

The server starts a PTY process using the selected command and workspace as `cwd`.

## 5. Switch, Close, and Reconnect Sessions

The header session dropdown shows currently live PTY sessions.

- Select a session to attach to it.
- Tap **×** to close the current session.
- If the page reconnects, the client asks the server for existing sessions and re-attaches when possible.

Closing a PTY session terminates the running process.

## 6. Session History

Tap the **history** button in the header.

History entries are stored in browser `localStorage`. One entry is kept for each CLI type and workspace pair.

Each entry stores:

- CLI profile id and display name
- command and startup arguments
- resume argument
- workspace path
- latest usage time
- associated live session id, when available

Entries are sorted by latest usage time.

Tap a history entry:

- If the linked session is still live, Venus Vibe Deck switches to it.
- If not, Venus Vibe Deck starts a new session using the saved CLI profile and workspace, with resume enabled by default when a resume argument exists.

Tap the recycle/delete icon:

- If the linked session is live, it is closed first.
- The history entry is then removed from `localStorage`.

## 7. Terminal Control Deck

The bottom panel is designed for touch-first AI CLI operation.

Main actions:

| Control | Action |
|---|---|
| `@` | Send `@` |
| `/` | Send `/` |
| Up | Arrow up |
| Down | Arrow down |
| Space | Send space |
| Esc | Send escape |
| Voice | Start or stop voice input |
| Backspace | Send delete/backspace |
| Enter | Send carriage return |

Long press controls:

| Control | Long press menu |
|---|---|
| Up | Left, Home |
| Down | Right, End |
| Space | Tab |
| Backspace | Clear current line |

More panel:

- Paste
- Toggle terminal keyboard
- Enter immersive mode

## 8. Terminal Keyboard

The keyboard toggle controls whether terminal tap/focus should allow mobile keyboard input.

- Keyboard off: better for touch-only operation.
- Keyboard on: useful when manual typing is needed.

Form fields in settings and workspace pickers always allow keyboard input.

## 9. Voice Input

Voice input has two modes:

1. **Browser-native voice**: runs in the browser through Web Speech APIs.
2. **Server voice**: browser records audio and sends it to the Node server for ASR.

Enable server voice in config:

```env
VOICE_USE_SERVER=true
VOICE_ASR_PROVIDER=cloud
```

Cloud ASR requires:

```env
VOICE_ASR_BASE_URL=wss://dashscope.aliyuncs.com/compatible-mode/v1/realtime
VOICE_ASR_API_KEY=sk-xxx
VOICE_ASR_MODEL=qwen3-asr-flash-realtime
```

Local ASR requires `stt-server`:

```env
VOICE_ASR_PROVIDER=local
VOICE_LOCAL_ASR_URL=http://127.0.0.1:7000
```

More details:

- [STT configuration](../stt.md)
- [Voice input notes](../voice-input.md)

## 10. Immersive Mode

Open **More → Immersive Vibe**.

In immersive mode:

- The terminal fills the screen.
- Long press starts voice input.
- Tap pending voice position to submit pending text.
- Move away from the pending voice position to cancel and clear the input line.
- Use the close button to exit immersive mode.

## 11. Workspace Picker

When creating a session:

- Type a path manually.
- Select from recent workspaces.
- Browse server directories through the directory picker.

Directory browsing is constrained by server-side allowed roots.

Configure allowed roots:

```env
VENUS_DIR_ROOTS=/home/me/projects,/srv/workspaces
```

## 12. Web Push Notifications

Web Push can notify your mobile device when the agent needs attention.

See:

- [Web push notifications](../web-push-notifications.md)

## 13. Troubleshooting

### The mobile page cannot connect

- Check that the server is running.
- Use the LAN IP instead of `localhost` on the phone.
- Make sure firewall rules allow the configured port.
- Use `HOST=0.0.0.0` for LAN access.

### New session button is disabled

The WebSocket is not connected. Refresh the page or check the server logs.

```bash
./start.sh log
```

### Server voice fails

- Check `VOICE_USE_SERVER=true`.
- For cloud ASR, verify `VOICE_ASR_API_KEY`.
- For local ASR, verify that `stt-server` is running.
- Confirm `VOICE_ASR_SAMPLE_RATE=16000`.

### Terminal output is missing after reconnect

Increase scrollback:

```env
SCROLLBACK_BYTES=200000
```

Then restart the server.

### Mobile browser asks for keyboard or context menu appears

Use the keyboard toggle and avoid long pressing outside the control buttons. Most control buttons suppress default mobile context menus.
