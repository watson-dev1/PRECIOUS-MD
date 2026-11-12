# PRECIOUS-MD Group Commands

Created by Watson Fourpence · Powered by Watson XD

Use the configured prefix (default: `.`). Commands marked **admin** require the sender to be a group administrator and PRECIOUS-MD to be a group administrator. WhatsApp may still reject an operation due to group settings, participant restrictions, or account limitations.

## Information

| Command | Description |
|---|---|
| `.groupinfo` | Show group name, ID, member count, admins and description |
| `.admins` | List group administrators |
| `.membercount` | Count members and administrators |
| `.groupowner` | Show the group creator when available |
| `.memberlist [page]` | List members in pages |
| `.groupstats` | Show group membership and security settings |
| `.groupinvite` / `.link` | Retrieve the current invite link |
| `.revoke` | Revoke the old invite link and create a new one (**admin**) |

## Member administration

| Command | Description |
|---|---|
| `.promote @member` | Promote a member (**admin**) |
| `.demote @member` | Demote an administrator (**admin**) |
| `.kick @member` | Remove a member (**admin**) |
| `.kick1` | Remove a mentioned or quoted member (legacy command) |
| `.add 2637XXXXXXXX` | Request to add a phone number (**admin**); WhatsApp may send an invite instead |
| `.tagall [message]` | Mention members in an announcement (**admin**) |
| `.hidetag [message]` | Mention members without printing the member list (**admin**) |

## Group controls

| Command | Description |
|---|---|
| `.mute` | Only admins can send messages (**admin**) |
| `.unmute` | Allow all members to send messages (**admin**) |
| `.lock` | Restrict group-info edits to admins (**admin**) |
| `.unlock` | Allow members to edit group info (**admin**) |
| `.setsubject New name` | Change group name (**admin**) |
| `.setdesc New description` | Change group description (**admin**) |
| `.groupinvite` | Get invite link |
| `.revoke` | Reset invite link (**admin**) |
| `.poll Question | Option 1 | Option 2` | Create a WhatsApp poll |

## Warnings and command controls

| Command | Description |
|---|---|
| `.warn @member [reason]` | Record a warning (**admin**) |
| `.warnings @member` | View warning history |
| `.resetwarn @member` | Clear warning history (**admin**) |
| `.maxwarn 3` | Set the displayed warning threshold from 1 to 20 (**admin**) |
| `.disablecmd command` | Disable a bot command in this group (**admin**) |
| `.enablecmd command` | Re-enable a bot command in this group (**admin**) |

Warnings are recorded persistently. The warning threshold is informational and does **not** automatically remove a member.

## Group automation and protection

| Command | Description |
|---|---|
| `.welcome on/off` | Toggle welcome messages (**admin**) |
| `.goodbye on/off` | Toggle goodbye messages (**admin**) |
| `.welcomemsg text` | Set welcome template (**admin**) |
| `.goodbyemsg text` | Set goodbye template (**admin**) |
| `.antilink on/off` | Toggle anti-link protection (**admin**) |
| `.antispam on/off` | Toggle anti-spam protection (**admin**) |
| `.antibad on/off` | Toggle bad-word protection (**admin**) |
| `.badword add word` | Add a blocked word (**admin**) |
| `.badword remove word` | Remove a blocked word (**admin**) |
| `.badword list` | List blocked words (**admin**) |
| `.groupai on/off` | Toggle AI replies in this group (**admin**) |
| `.subjectnotify on/off` | Toggle group-name change notifications (**admin**) |
| `.descnotify on/off` | Toggle group-description change notifications (**admin**) |

## Help

- `.grouphelp` — existing group help
- `.groupcommands` — expanded group command guide

## Operational notes

- Mention or reply to a member when a command requires `@member`.
- Keep PRECIOUS-MD as a group admin for participant and group-setting operations.
- Some WhatsApp operations are subject to server-side restrictions and cannot be guaranteed by the bot.
- Anti-bot, anti-porn, anti-scam and anti-raid controls must only be advertised as active if their message-processing enforcement is enabled in the corresponding security engine.
