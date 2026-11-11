/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as adaptiveTutor from "../adaptiveTutor.js";
import type * as assessments from "../assessments.js";
import type * as courses from "../courses.js";
import type * as evaluations from "../evaluations.js";
import type * as http from "../http.js";
import type * as ingestion from "../ingestion.js";
import type * as knowledgeGraph from "../knowledgeGraph.js";
import type * as learnerModel from "../learnerModel.js";
import type * as sources from "../sources.js";
import type * as studyIntelligence from "../studyIntelligence.js";
import type * as tutor from "../tutor.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  adaptiveTutor: typeof adaptiveTutor;
  assessments: typeof assessments;
  courses: typeof courses;
  evaluations: typeof evaluations;
  http: typeof http;
  ingestion: typeof ingestion;
  knowledgeGraph: typeof knowledgeGraph;
  learnerModel: typeof learnerModel;
  sources: typeof sources;
  studyIntelligence: typeof studyIntelligence;
  tutor: typeof tutor;
  users: typeof users;
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
