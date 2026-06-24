# Repository Guidelines

## Project Structure & Module Organization

This npm workspace contains a mobile AI coding HUD. Root `package.json` coordinates two packages. Server code lives in `server/src`, with HTTP routes in `server/src/http`, WebSocket handling in `server/src/ws`, PTY sessions in `server/src/session`, and storage helpers in `server/src/storage`. Client code lives in `client/src`, with React components in `client/src/components`, shared state in `client/src/state`, hooks in `client/src/hooks`, API helpers in `client/src/api`, and SVG assets in `client/src/asserts/icons`. Project notes are in `docs/`; `spec.md` captures the product specification.

## Build, Test, and Development Commands

- `npm install`: install workspace dependencies.
- `npm run dev`: run the server in watch mode and rebuild the client continuously.
- `npm run build`: type-check and build both `@venus/server` and `@venus/client`.
- `npm run start`: start the compiled server from `server/dist/index.js`.
- `npm run build -w @venus/client`: run `tsc --noEmit` and `vite build` for the React client.
- `npm run build -w @venus/server`: compile the TypeScript server.

There is no dedicated `test` script; use `npm run build` as baseline verification before submitting changes.

## Coding Style & Naming Conventions

Use TypeScript with ES modules. Match the existing style: two-space indentation, single quotes, semicolons, and explicit relative imports with `.js` extensions in server TypeScript where Node ESM requires them. Name React components in PascalCase, hooks with `use` prefixes, and types/interfaces in PascalCase. Keep modules focused by feature, and follow `CLAUDE.md`.

## Testing Guidelines

No automated test framework is configured. When adding tests, place them near the behavior they cover or in a package-level test directory, and use names like `SessionManager.test.ts` or `ControlPanel.test.tsx`. For now, verify changes with `npm run build` and manually exercise terminal sessions, WebSocket connection state, session switching, and workspace selection when touched.

## Commit & Pull Request Guidelines

Git history uses concise Conventional Commit-style subjects, for example `feat: init project`. Keep commits short and scoped with prefixes such as `feat:`, `fix:`, `refactor:`, or `docs:`. Pull requests should include a summary, verification, linked issues when applicable, and screenshots or recordings for visible client changes. Note environment assumptions, especially PTY command, host, or port changes.

## Security & Configuration Tips

Be careful with filesystem and shell access. Server code spawns PTY sessions and exposes directory listing APIs, so validate paths with existing guard utilities. Do not commit local secrets, machine-specific paths, or generated build output from `dist`.
