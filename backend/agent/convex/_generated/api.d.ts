/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */
import type * as agents from "../agents.js";
import type * as agentsNode from "../agentsNode.js";
import type * as auth from "../auth.js";
import type * as compaction from "../compaction.js";
import type * as crons from "../crons.js";
import type * as http from "../http.js";
import type * as mcp from "../mcp.js";
import type * as messages from "../messages.js";
import type * as orchestrator from "../orchestrator.js";
import type * as orchestratorNode from "../orchestratorNode.js";
import type * as rateLimit from "../rateLimit.js";
import type * as retention from "../retention.js";
import type * as sessions from "../sessions.js";
import type * as staleTaskCleanup from "../staleTaskCleanup.js";
import type * as tasks from "../tasks.js";
import type * as testauth from "../testauth.js";
import type * as todos from "../todos.js";
import type * as tokenUsage from "../tokenUsage.js";
import type * as webSearch from "../webSearch.js";
import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
declare const fullApi: ApiFromModules<{
  agents: typeof agents;
  agentsNode: typeof agentsNode;
  auth: typeof auth;
  compaction: typeof compaction;
  crons: typeof crons;
  http: typeof http;
  mcp: typeof mcp;
  messages: typeof messages;
  orchestrator: typeof orchestrator;
  orchestratorNode: typeof orchestratorNode;
  rateLimit: typeof rateLimit;
  retention: typeof retention;
  sessions: typeof sessions;
  staleTaskCleanup: typeof staleTaskCleanup;
  tasks: typeof tasks;
  testauth: typeof testauth;
  todos: typeof todos;
  tokenUsage: typeof tokenUsage;
  webSearch: typeof webSearch;
}>;
/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;
/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;
export declare const components: {};
