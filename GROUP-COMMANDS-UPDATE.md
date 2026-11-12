# Group Commands Update

This update adds `plugins/group-management.js` to the existing PRECIOUS-MD project.

New commands and aliases:

- `mute` (`gcmute`, `close`, `gcclose`)
- `unmute` (`gcunmute`, `open`, `gcopen`)
- `lock` (`gclock`)
- `unlock` (`gcunlock`)
- `groupinvite` (`gclink`, `invitelink`)
- `groupowner` (`gcowner`)
- `memberlist` (`gcmembers`, `listmembers`)
- `groupstats` (`gcstats`)
- `warn` (`gwarn`)
- `warnings` (`gwarnings`, `checkwarn`)
- `resetwarn` (`clearwarn`)
- `maxwarn` (`setmaxwarn`)
- `disablecmd` (`disablecommand`)
- `enablecmd` (`enablecommand`)
- `groupcommands` (`gcommands`, `groupmenu`)

Existing group plugins retain the current information, welcome/goodbye, moderation, participant administration, tagall/hidetag, invite reset, and poll commands. See `GROUP-COMMANDS-GUIDE.md` for the combined command reference.

Validation performed: JavaScript syntax checks and duplicate-primary/alias conflict checks for the added plugin. Live WhatsApp group testing is still required.
