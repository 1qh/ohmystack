# References

Comprehensive reference index for the web agent harness plan.

## Official documentation links

- AI SDK v6: <https://ai-sdk.vercel.ai/docs>
- Convex: <https://docs.convex.dev>
- @convex-dev/auth: <https://labs.convex.dev/auth>
- convex-helpers: <https://github.com/get-convex/convex-helpers>
- MCP: <https://modelcontextprotocol.io>
- Next.js App Router: <https://nextjs.org/docs/app>
- Playwright: <https://playwright.dev>

## oh-my-openagent source paths (commit `5073efe`)

- Main agent loop: `src/index.ts`
- Agent definitions: `src/agents/`
- Delegation: `src/tools/delegate-task/`
- Background tasks: `src/features/background-agent/`
- MCP: `src/mcp/`
- Compaction: `src/index.compaction-model-agnostic.static.test.ts`
- Tools: `src/tools/`
- System prompts: `src/agents/sisyphus/`, `src/agents/sisyphus-junior/`
- Task management: `src/features/claude-tasks/`
- Run continuation: `src/features/run-continuation-state/`

## Key API reference quick links

- `streamText`: <https://ai-sdk.vercel.ai/docs/reference/ai-sdk-core/stream-text>
- `generateText`: <https://ai-sdk.vercel.ai/docs/reference/ai-sdk-core/generate-text>
- `tool`: <https://ai-sdk.vercel.ai/docs/reference/ai-sdk-core/tool>
- Convex actions: <https://docs.convex.dev/functions/actions>
- Convex mutations: <https://docs.convex.dev/functions/mutations>
- Convex queries: <https://docs.convex.dev/functions/query-functions>
- Convex scheduling: <https://docs.convex.dev/scheduling/scheduled-functions>

## oh-my-openagent documentation & visualizations

The oh-my-openagent repo contains rich Mermaid-based architecture visualizations:

- Orchestration system guide with 3-layer architecture diagram: `docs/guide/orchestration.md`
- Planning state machine (Prometheus interview flow): `docs/guide/orchestration.md` (stateDiagram-v2)
- Atlas execution flow: `docs/guide/orchestration.md` (flowchart LR)
- Feature AGENTS.md files with per-module context: `src/features/AGENTS.md`, `src/hooks/AGENTS.md` Our plan’s Mermaid diagrams are inspired by these but adapted for the web architecture (Convex + Next.js instead of CLI).

## noboil internal references

- Schema patterns: `lib/convex/src/server/setup.ts`
- CRUD with hooks: `lib/convex/src/server/crud.ts`
- Test auth: `backend/convex/convex/testauth.ts`
- Proxy middleware: `lib/fe/src/proxy.ts`

## oh-my-openagent Parity Matrix

| oh-my-openagent Feature    | Our Status | Notes                                                                 |
| -------------------------- | ---------- | --------------------------------------------------------------------- |
| Parallel background tasks  | Borrowed   | Same delegation model, adapted for Convex scheduler                   |
| Todo continuation enforcer | Borrowed   | Stagnation detection, cooldown, failure cap — same logic              |
| Compaction todo preserver  | Borrowed   | Snapshot → restore pattern                                            |
| Task reminder injection    | Borrowed   | turnsSinceTaskTool counter, threshold 10                              |
| Delegate retry guidance    | Borrowed   | Same error pattern detection + fix hints                              |
| Error classifier           | Borrowed   | Same transient/permanent classification patterns                      |
| Message compaction         | Adapted    | Closed-prefix grouping adapted for Convex tables (not file-based)     |
| CAS queue concurrency      | Adapted    | Same single-slot-per-thread model, implemented as Convex mutations    |
| Real-time streaming        | Adapted    | streamText + reactive useQuery (replaces CLI streaming)               |
| Multi-agent delegation     | Adapted    | Same orchestrator→worker model, workers stream via Convex             |
| MCP integration            | Adapted    | HTTP-only transport (no stdio in serverless)                          |
| Token usage tracking       | Adapted    | Per-session aggregation in Convex table                               |
| System reminders           | Adapted    | Injected as system messages in thread (replaces CLI prompt injection) |
| Model/category config      | Excluded   | Single model (Gemini), no category/skill/variant system               |
| Slash commands             | Excluded   | Web app, no CLI                                                       |
| File editing               | Excluded   | Not a coding agent                                                    |
| Code execution             | Excluded   | Not a coding agent                                                    |
| Plan mode                  | Excluded   | Single orchestrator, no planning phase                                |
| Process management         | Excluded   | Convex scheduler replaces OS processes                                |
| TUI/toast                  | Excluded   | Reactive UI replaces terminal notifications                           |
