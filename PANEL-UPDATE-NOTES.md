# PRECIOUS-MD panel update

## Install
Run `npm install` after replacing the project files. `bcryptjs` was added for dashboard password hashing.

## Dashboard
The server serves `public/index.html`; the root `index.html` is kept identical for convenience.
The dashboard creates its first password at `/api/auth/setup`, stores a bcrypt hash in `database/settings.json`, and uses an expiring in-memory token in `X-Dashboard-Token`. `PANEL_PASSWORD` in hosting environment variables takes precedence and remains supported for legacy `X-Panel-Password` control calls.

To reset a database-created password, the primary owner (263781340745) can send `.resetpassword` to the bot. The command removes only the saved dashboard hash; reload the dashboard to create a new password. If `PANEL_PASSWORD` is configured, change it in hosting instead.

## Important capability notes
- The uploaded source has one active WhatsApp socket/session, not a multi-session manager.
- The current pairing backend supports pairing codes; it does not expose QR generation.
- WhatsApp does not provide a Baileys API for muting a group's notifications on a user's phone. The dashboard's group mute/unmute controls mute/unmute the bot's command handling in that group.
- The current chatbot implementation uses its existing `https://ch.at/v1/chat/completions` provider. The dashboard persists the selected model label, but GPT and Gemini are disabled until provider integrations and credentials are added. The personality field is applied to the current chatbot system prompt.
- Offline auto-reply is implemented as a private-chat automatic response while the bot is online and chatbot mode is off. WhatsApp cannot deliver replies while the bot process is actually offline.
- CPU percentage is an average process CPU usage estimate since process start. Last deploy time is shown only when the host supplies `DEPLOYED_AT` or `RENDER_GIT_COMMIT_CREATED_AT`.
- User tracking begins after this update is deployed; older WhatsApp history is not backfilled. User message history is limited to the latest 50 recorded messages per tracked user.
- Backend logs are not streamed live in the existing server. The panel labels that limitation instead of showing fabricated log entries.

## New dashboard API routes
- `GET /api/auth/status`
- `POST /api/auth/setup`
- `POST /api/auth/login`
- `POST /api/auth/change-password`, `POST /api/auth/logout`
- `GET /api/users`, `POST /api/users/block`, `POST /api/users/unblock`
- `POST /api/users/admin`, `POST /api/users/remove-admin`, `GET /api/users/:number/history`
- `GET /api/groups`, `POST /api/groups/action`
- `GET /api/autoreply`, `PUT /api/autoreply`
- `POST /api/broadcast`, `POST /api/send`
- `GET /api/settings`, `PATCH /api/settings`, `POST /api/ai/clear`
- `GET /api/owners`, `POST /api/owners`, `DELETE /api/owners`
- `GET /api/banned`, `POST /api/unban`
- `GET /api/media`, `POST /api/media/clear`
- `GET /api/notifications`, `PUT /api/notifications`

Existing `/api/status`, `/api/pair`, and `/api/control` are retained. `GET /api/status` remains public with a limited status response for compatibility; dashboard requests use the token.

## Added plugins and event
New plugins: `broadcast.js`, `usermanager.js`, `groupmanager.js`, `welcome.js`, `autoreply.js`, `send.js`, `ai.js`, `owner.js`, `ban.js`, `media.js`, `resetpassword.js`.
New event: `lib/events/panelautoreply.js`.
Updated existing events: `lib/events/welcomegoodbye.js`, `lib/events/chatbot.js`.

## Existing relevant plugins found in the uploaded archive
The archive contained 93 plugin JavaScript files. Relevant pre-existing files included:
- AI: `plugins/ai/chatbot.js`, `plugins/ai/deepseek.js`
- Group: `plugins/group/group.js`, `plugins/group/invite.js`, `plugins/group/left.js`, `plugins/group/participants.js`, `plugins/group/groupsettings.js`, `plugins/group/tagall.js`
- Owner/security: `plugins/owner/addowner.js`, `plugins/owner/delowner.js`, `plugins/owner/listowner.js`, `plugins/owner/listgroup.js`, `plugins/owner/block.js`, `plugins/owner/restart.js`
- Media/download: `plugins/download/apk.js`, `plugins/download/play.js`, `plugins/download/tiktok.js`, `plugins/download/video.js`, plus converter tools under `plugins/tools/`.

The `lib/events/welcomegoodbye.js` event also existed before this update and was extended to honor dashboard welcome/goodbye settings.

## New backend files / persisted data
`database/panel.json` stores panel user tracking, bans, sudo list, muted groups, notification preferences, and usage counters. Password hashes are stored separately in `database/settings.json` under `panelPasswordHash`; no password is stored in plaintext.
