# Repository Guidelines

## Project Structure & Module Organization
- `server/`: Express API, Feishu WebSocket workers, SQLite access, CLI bridges; share helpers in `server/lib/`.
- `src/`: React 18 UI (JSX + Tailwind); shared logic in `src/utils/` and `src/contexts/`.
- `teacher/`: AI 初老师 bot for bot-to-bot flows; tests in `teacher/tests/`.
- `auto/`: automation runners and Bull workers with its own `package.json`.
- `test/` and `feishu/`: Node tests and diagnostics for CLI + Feishu flows.
- `public/` assets, `dist/` build output, `scripts/` ops tasks; `feicc/` is runtime workspace (do not commit).

## Build, Test, and Development Commands
```bash
npm install                # Install JS deps
npm run dev                # Backend + Vite client together
npm run server             # Backend only
npm run client             # Frontend only
npm run build && npm run preview  # Production build + local preview
npm run test               # Server restart RCA suite
npm run test:feishu        # Feishu integration (needs Feishu env + tokens)
```
For PM2 deployments, pair `npm run start` or `npm run feishu` with PM2 as shown in `README.md`.

## Coding Style & Naming Conventions
- JavaScript is ESM; prefer functional React components with hooks.
- 2-space indent, single quotes, trailing commas where present.
- Keep UI state in contexts/hooks; extract helpers instead of heavy component logic.
- Tailwind lives inline; shared tokens belong in `src/index.css`.
- Name by feature (`TaskList.jsx`, `feishu-session.js`); tests mirror source (`test-*.js`, `test_*.py`).

## Testing Guidelines
- JS tests run via Node scripts under `test/` and `feishu/`; Python bot tests under `teacher/tests/` (pytest style).
- Add regression coverage with new logic; mock external Feishu/GitHub calls when possible.
- Before PRs, run `npm run test` plus relevant Feishu/teacher suites.

## Commit & Pull Request Guidelines
- Use conventional commits as in history (`feat: ...`, `fix: ...`, `docs: ...`, `refactor: ...`). Example: `feat: add feishu session watchdog`.
- PRs need a short summary, linked issue, manual test results, and screenshots for UI changes.
- Keep env details clear (`PORT`, `CLAUDE_CLI_PATH`, `Github_Token`, Feishu keys, DeepSeek key`) and never commit secrets.

## Security & Configuration Tips
- Use `.env` from `.env.example`; never commit tokens or runtime artifacts (`logs/`, `feicc/`, `server/database/auth.db`).
- `feicc/` paths are hardcoded in `server/lib/feishu-session.js`; do not rename or prune user/session folders without migration.
- Keep the single root git repo clean—avoid nested `.git` folders.
