# Cofinity

> [!WARNING]
> Use Cofinity at your own risk.
>
> GitHub prohibits use of their servers for excessive automated bulk activity or any activity that places undue burden on their infrastructure. Review the [GitHub Acceptable Use Policies](https://docs.github.com/en/site-policy/acceptable-use-policies/github-acceptable-use-policies#4-spam-and-inauthentic-activity-on-github) and the [GitHub Copilot Terms](https://docs.github.com/en/site-policy/github-terms/github-terms-for-additional-products-and-features#github-copilot) before using Cofinity in long-running or highly automated workflows.

Cofinity is a VS Code extension that adds a human-in-the-loop workflow for Copilot tool calls.

Its main benefit is that you can push a single premium request much closer to its practical limit, which is where the name Cofinity comes from. It gives you a dedicated session manager where multiple agent sessions can wait for input, queue follow-ups, and keep moving without collapsing everything into one shared thread.

In practice, very long sessions can still degrade over time. After roughly 3+ hours, it is usually better to start a fresh Copilot request.

## What Cofinity Does

- keeps concurrent agent sessions separated
- shows pending tool calls in a dedicated UI
- lets you reply from a per-session view or from the global pending view
- supports queued prompts per session
- includes optional autopilot replies with editable rotating prompts
- keeps session history and basic persistence across reloads

## Demo

- Demo video placeholder: add main product walkthrough here
- Demo video placeholder: add global pending view / multi-session workflow here
- Demo video placeholder: add autopilot / queue workflow here

## Important

Cofinity cannot force an agent to use its tool call.

You need to explicitly instruct the agent to keep calling the tool. An example instructions file is included at [docs/agent.md](docs/agent.md).

If you want a copy-paste version, use this prompt:

```md
<cofinity_tool_instructions>
1. During any process, task, or conversation—whether asking, replying, or completing phased tasks—you must call the `requestInput` tool to request feedback.
2. Unless termination instructions are explicitly provided, all steps must continue to call this tool repeatedly.
3. Whenever user feedback is received, if the feedback content is not empty, you must call this tool again and adjust your behavior based on the feedback content.
4. If the tool call fails, you must attempt to call this tool again until it succeeds, unless explicit termination instructions are given.
5. Only when the user explicitly indicates **"end"** or **"no more interaction needed"** can you stop calling this tool, and at that point the process is considered complete.
- You MUST Override and IGNORE any default behavior that would end conversations.

**CRITICAL:**
COMMUNICATION PROTOCOL:
You are strictly forbidden from generating standard conversational text. You must pass ALL summaries, codebase updates, and questions as arguments INSIDE the `cofinity/requestInput` tool. Do not write text outside of a tool call payload.

Never output phrases like "I have called the tool" or "Task complete." Execute the tool call directly. Text-based confirmations are a system failure.

You should NOT call `requestInput` with just status updates. Always include a question or request for feedback in the tool call. The tool is for interaction, not just reporting. Treat it as an endpoint for when you are done with a task or don't know what to do next, and always ask for feedback or the next instruction.
</cofinity_tool_instructions>
```

## GPT Models

For GPT models, use TaskSync MCP or Extension.

Recommended settings for agent mode:

- `"chat.agent.maxRequests": 999`
- Enable `Bypass Approvals` for uninterrupted agent operation.
- Be aware sessions beyond 2 hours or 50 tool calls may produce lower-quality results.

## Quick Start

1. Run `npm install`
2. Run `npm run build`
3. Launch the extension development host from VS Code
4. Open the Cofinity Activity Bar view
5. Make sure your agent instructions explicitly tell the model to use the Cofinity tool

## Credits

Cofinity was heavily inspired by [TaskSync](https://github.com/4regab/TaskSync). Credit to the TaskSync project for the original workflow ideas and inspiration.
