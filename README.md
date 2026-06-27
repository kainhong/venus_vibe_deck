# Venus Vibe Deck

<p>
  <a href="./LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-blue.svg"></a>
  <img alt="Node.js 20+" src="https://img.shields.io/badge/node-%3E%3D20-339933.svg">
  <img alt="React" src="https://img.shields.io/badge/client-React%20%2B%20xterm.js-61dafb.svg">
  <img alt="Server" src="https://img.shields.io/badge/server-Node.js%20%2B%20PTY-333333.svg">
</p>

**Turn your phone into a voice-first control deck for AI coding.**

Venus Vibe Deck is a mobile web console for people who run AI coding tools on a real development machine but want a better way to steer them from a phone or tablet.

It gives you a readable terminal, a personalized touch keyboard for coding-agent prompts, voice input for long instructions, immersive full-screen operation, and multi-session history. It is not tied to one AI vendor: use it with Claude Code, Codex, Gemini CLI, Aider, OpenCode, plain `bash`, or any command-line tool that runs in a terminal.

English · [简体中文](./README.zh-CN.md) · [User Guide](./docs/helps/user-guide.md)

## The Pitch

AI coding tools are powerful, but their interaction model is still terminal-heavy: approve, reject, move up/down, select files, paste context, continue a session, dictate a task, wait for completion.

Venus Vibe Deck separates the **workbench** from the **control surface**:

- Your repo, shell, credentials, MCP servers, and AI agents stay on the server.
- Your phone becomes a fast command deck for voice, navigation, confirmation, interruption, and session switching.
- Your workflow remains tool-neutral because everything is just PTY input and output.

## Highlights

- **Voice-first coding input**: dictate long prompts or quick commands instead of fighting a mobile keyboard. Use browser-native speech or server-side ASR.
- **Personalized coding keyboard**: configure your own CLI profiles and use a purpose-built touch deck for arrows, tab, home/end, enter, escape, backspace, clear line, paste, and keyboard toggle.
- **Immersive mode**: hide the chrome, fill the screen with terminal output, and drive the agent with long-press voice gestures.
- **Multi-session by design**: create, switch, close, reconnect, and resume multiple PTY sessions from one mobile UI.
- **Tool-neutral PTY bridge**: works with any terminal CLI: Claude Code, Codex, Gemini CLI, Aider, OpenCode, custom scripts, or plain shells.
- **Session history that understands workflows**: remember CLI type + workspace pairs, reconnect live sessions, or restart with the CLI resume flag.
- **Workspace-aware startup**: launch each session in the right project directory with saved CLI arguments.
- **Cloud or local speech**: choose cloud realtime ASR or run the optional local `stt-server` for offline recognition.
- **LLM transcript refinement**: clean voice transcripts and match configured commands before text reaches the terminal.
- **Mobile reliability details**: reconnect handling, scrollback replay, touch scrolling, soft-keyboard control, and Web Push notifications.

## Demo Flow

```text
Phone / tablet browser
        |
        | touch keys, voice input, WebSocket
        v
Venus Vibe Deck server
        |
        | PTY stdin/stdout
        v
bash / Claude Code / Codex / custom agent CLI
```

## Screens

<p>
  <img src="./docs/images/image.png" width="240" alt="Terminal HUD with personalized control deck">
  <img src="./docs/images/image-2.png" width="240" alt="More panel with paste, keyboard toggle, and immersive mode">
  <img src="./docs/images/image-3.png" width="240" alt="Voice-first immersive mode">
</p>

<p>
  <img src="./docs/images/image-4.png" width="240" alt="New session panel with tool-neutral CLI selection">
  <img src="./docs/images/image-5.png" width="240" alt="Session history panel">
  <img src="./docs/images/image-6.png" width="240" alt="Settings panel with hand preference and voice configuration summary">
</p>

- **Terminal HUD**: readable PTY output with a mobile coding control deck.
- **More panel**: paste, keyboard toggle, and immersive mode entry.
- **Immersive mode**: full-screen terminal with voice-first interaction.
- **Tool-neutral sessions**: create sessions for Claude, Codex, OpenCode, or any custom CLI.
- **Session history**: reconnect live sessions or resume past CLI + workspace workflows.
- **Settings**: switch left/right hand operation and inspect voice command configuration.

## Quick Start

```bash
npm install
npm run build
npm run start
```

The server listens on `0.0.0.0:8001` by default.

Open from a mobile device on the same network:

```text
http://<server-lan-ip>:8001
```

Development mode:

```bash
npm run dev
```

## Configuration

Copy `.env.example` to `.env` and adjust it.

| Variable | Purpose | Default |
|---|---|---|
| `HOST` | HTTP/WebSocket host | `0.0.0.0` |
| `PORT` | HTTP/WebSocket port | `8001` |
| `PTY_COMMAND` | default command for new sessions | `bash` |
| `PTY_ARGS` | default command arguments | empty |
| `SCROLLBACK_BYTES` | reconnect scrollback buffer size | `51200` |
| `AUTH_ENABLED` | require password authentication before using the app | `false` |
| `AUTH_PASSWORD` | password used when authentication is enabled | empty |
| `AUTH_TTL_DAYS` | login validity period in days | `7` |
| `AUTH_TOKEN_SECRET` | optional signing secret for auth tokens | `AUTH_PASSWORD` |
| `VOICE_USE_SERVER` | use server-side voice recognition | `false` |
| `VOICE_ASR_PROVIDER` | `cloud` or `local` | `cloud` |
| `VENUS_DIR_ROOTS` | directory browser allowlist | home + cwd |
| `VENUS_DATA_DIR` | runtime data directory | `~/.venus-vibe-deck` |

Runtime data:

```text
~/.venus-vibe-deck
```

## Documentation

- [User Guide](./docs/helps/user-guide.md)
- [中文使用说明](./docs/helps/user-guide.zh-CN.md)
- [Speech Recognition](./docs/stt.md)
- [Text to Speech](./docs/tts.md)
- [Web Push Notifications](./docs/web-push-notifications.md)
- [Session Lifecycle](./docs/session-lifecycle.md)
- [Frontend Interaction Spec](./docs/spec-ui.md)

## Repository Layout

```text
client/        React mobile UI
server/        Node.js HTTP, WebSocket, PTY, speech and storage services
stt-server/    optional local Python STT service
docs/          specs and feature documentation
docs/helps/    user-facing guides
```

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | run server watch mode and client build watch |
| `npm run build` | build server and client |
| `npm run start` | start compiled server |
| `./start.sh` | build and start in background |
| `./start.sh stop` | stop background server |
| `./start.sh log` | tail server log |

## Security

Venus Vibe Deck can spawn shell processes and expose directory browsing APIs. Treat it as a trusted-network tool.

- Do not expose it directly to the public internet without authentication and network controls.
- Restrict `VENUS_DIR_ROOTS` before deploying on shared machines.
- Do not commit `.env`, API keys, or runtime data.

## Author

Kain

## License

[MIT](./LICENSE)
