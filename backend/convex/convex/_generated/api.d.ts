/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as blog from "../blog.js";
import type * as blogProfile from "../blogProfile.js";
import type * as chat from "../chat.js";
import type * as file from "../file.js";
import type * as http from "../http.js";
import type * as message from "../message.js";
import type * as movie from "../movie.js";
import type * as org from "../org.js";
import type * as orgProfile from "../orgProfile.js";
import type * as poll from "../poll.js";
import type * as pollVoteQuota from "../pollVoteQuota.js";
import type * as presence from "../presence.js";
import type * as project from "../project.js";
import type * as siteConfig from "../siteConfig.js";
import type * as task from "../task.js";
import type * as testauth from "../testauth.js";
import type * as tools_weather from "../tools/weather.js";
import type * as user from "../user.js";
import type * as vote from "../vote.js";
import type * as wiki from "../wiki.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  blog: typeof blog;
  blogProfile: typeof blogProfile;
  chat: typeof chat;
  file: typeof file;
  http: typeof http;
  message: typeof message;
  movie: typeof movie;
  org: typeof org;
  orgProfile: typeof orgProfile;
  poll: typeof poll;
  pollVoteQuota: typeof pollVoteQuota;
  presence: typeof presence;
  project: typeof project;
  siteConfig: typeof siteConfig;
  task: typeof task;
  testauth: typeof testauth;
  "tools/weather": typeof tools_weather;
  user: typeof user;
  vote: typeof vote;
  wiki: typeof wiki;
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
