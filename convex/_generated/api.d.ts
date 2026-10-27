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
import type * as blandHttp from "../blandHttp.js";
import type * as captureHttp from "../captureHttp.js";
import type * as captureJobs from "../captureJobs.js";
import type * as captures from "../captures.js";
import type * as demo from "../demo.js";
import type * as discover from "../discover.js";
import type * as groups from "../groups.js";
import type * as graph from "../graph.js";
import type * as http from "../http.js";
import type * as intelligence from "../intelligence.js";
import type * as intelligenceJobs from "../intelligenceJobs.js";
import type * as journeyValidators from "../journeyValidators.js";
import type * as memoryConsent from "../memoryConsent.js";
import type * as network from "../network.js";
import type * as networkJobs from "../networkJobs.js";
import type * as networkState from "../networkState.js";
import type * as networkValidators from "../networkValidators.js";
import type * as onboarding from "../onboarding.js";
import type * as onboardingJobs from "../onboardingJobs.js";
import type * as onboardingValidators from "../onboardingValidators.js";
import type * as opportunities from "../opportunities.js";
import type * as preferences from "../preferences.js";
import type * as presentation from "../presentation.js";
import type * as profileState from "../profileState.js";
import type * as social from "../social.js";
import type * as socialJobs from "../socialJobs.js";
import type * as socialState from "../socialState.js";
import type * as socialValidators from "../socialValidators.js";
import type * as sourceJobs from "../sourceJobs.js";
import type * as sources from "../sources.js";
import type * as state from "../state.js";
import type * as validators from "../validators.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  blandHttp: typeof blandHttp;
  captureHttp: typeof captureHttp;
  captureJobs: typeof captureJobs;
  captures: typeof captures;
  demo: typeof demo;
  discover: typeof discover;
  groups: typeof groups;
  graph: typeof graph;
  http: typeof http;
  intelligence: typeof intelligence;
  intelligenceJobs: typeof intelligenceJobs;
  journeyValidators: typeof journeyValidators;
  memoryConsent: typeof memoryConsent;
  network: typeof network;
  networkJobs: typeof networkJobs;
  networkState: typeof networkState;
  networkValidators: typeof networkValidators;
  onboarding: typeof onboarding;
  onboardingJobs: typeof onboardingJobs;
  onboardingValidators: typeof onboardingValidators;
  opportunities: typeof opportunities;
  preferences: typeof preferences;
  presentation: typeof presentation;
  profileState: typeof profileState;
  social: typeof social;
  socialJobs: typeof socialJobs;
  socialState: typeof socialState;
  socialValidators: typeof socialValidators;
  sourceJobs: typeof sourceJobs;
  sources: typeof sources;
  state: typeof state;
  validators: typeof validators;
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
