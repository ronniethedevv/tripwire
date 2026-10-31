# Room message formats (Discord via Switch)

General: plain, short, scannable on a phone. Max ~1,200 characters per message (Discord's hard
limit is 2,000). Mention only the people or agents who must act. Times in UTC plus the room's
local zone (Africa/Lagos for the demo). Always link the evidence. No emoji except the three status
marks below.

Status marks: ⏳ armed · 🔔 fired · ✅ closed

## Proposal (asks a human to confirm)
```
Proposed hold: <title>
Waiting for: <condition in plain words>
Why we're waiting: <reason, one line>
Owner: @<owner>
Reply "yes" to arm, or tell me what to change.
```

## Armed
```
⏳ Holding: <title> — until <condition>. I'll bring it back the moment that's true.
```

## Reopen card (decision fired)
```
🔔 Ready to decide: <title>
What changed: <condition> — <evidence link> (<time>)
Why we waited: <reason>
Decide: @<owner>
Original discussion: <source link>
```

## Agent wake note (agent_block fired)
```
@<agent> you're unblocked: <condition> — <evidence link>. Resume: <title>.
```

## Ledger ("@tripwire open")
```
Open loops in this room (<n>):
1. ⏳ <title> — until <condition> — owner @<owner> — since <date>
...
```

## Unobserved notice (only once per loop, after 30 minutes unobserved)
```
I can't check "<condition>" right now (<source> unreachable). Still holding <title>; nothing fired.
```
