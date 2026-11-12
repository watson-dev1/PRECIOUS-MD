# PRECIOUS-MD Phase 3 — Dashboard Controls

Created by Watson Fourpence · Powered by Watson XD

## Included

- Added a Group Security section to the dashboard navigation.
- Added authenticated `GET /api/groups/security` to list groups already recorded in the database and their security configuration.
- Added authenticated `PATCH /api/groups/:jid/security` to update only supported group security fields.
- Added dashboard controls for anti-link, anti-bad-words, anti-spam, anti-scam, anti-mention, anti-bot, anti-porn and anti-foreign.
- Added per-group warning thresholds, mention thresholds and allowed country calling codes.
- Added validation for group JIDs, boolean switches, numeric ranges and country calling codes.
- Settings are persisted through the existing database save queue.
- Based on the prior PRECIOUS-MD Security Upgrade package, retaining its status automation, group anti-porn setting and moderation changes.

## Notes

- The group dashboard lists groups already present in `db.groups`; use the bot in a group first to create its record.
- Anti-porn currently uses supported text/caption signals. It is not a general-purpose image/video classifier.
- Anti-bot detection is heuristic and cannot identify every automated account.
- Deleting messages and removing members requires the bot to have appropriate group administrator permissions.
- Dashboard access still requires `DASHBOARD_PASSWORD` (or the existing configured dashboard credentials).

## Validation performed

- `node --check index.js`
- `node --check config.js`
- `node --check` on all `lib/*.js` and `plugins/*.js`
- `node --check` on the dashboard's inline JavaScript
- ZIP integrity test

Live WhatsApp and browser-session testing has not been performed in this build environment.
