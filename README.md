# Birthday Photo App

This repo now includes a minimal Slack Control Bot for the workflow described in [prompts/slack-bot.md](/Users/dharnasrivastava/Documents/birthday-photo-app/birthday-photo-app/prompts/slack-bot.md).

## Slack integration

Install dependencies, set the Slack env vars from [.env.example](/Users/dharnasrivastava/Documents/birthday-photo-app/birthday-photo-app/.env.example), then run:

```bash
npm install
npm run slack:bot
```

Configure your Slack app with Socket Mode enabled and register these slash commands:

- `/build-birthday`
- `/agent-status`
- `/blockers`
- `/qa-run`
- `/approve`
- `/ship-it`
- `/design-sync`
- `/figma-status`

The bot persists lightweight workflow state in `.runtime/slack-state.json` so `/agent-status` and `/blockers` can return the latest known state.
