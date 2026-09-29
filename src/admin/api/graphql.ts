/**
 * GraphQL Admin API client using Shopify "Direct API access": App Bridge
 * routes `shopify:admin/...` requests through the admin itself, so this app
 * needs no backend, no access tokens and no database.
 */

export const API_VERSION = "2026-07";
let endpoint = `shopify:admin/api/${API_VERSION}/graphql.json`;

/** Admin UI extensions use the unversioned endpoint (the extension's api_version applies). */
export function setApiEndpoint(url: string): void {
  endpoint = url;
}

export interface GraphQLErrorItem {
  message: string;
  extensions?: { code?: string; [key: string]: unknown };
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly errors: GraphQLErrorItem[] = [],
    readonly status = 0,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface UserError {
  field?: string[] | null;
  message: string;
  code?: string | null;
}

interface CostInfo {
  requestedQueryCost?: number;
  throttleStatus?: { maximumAvailable: number; currentlyAvailable: number; restoreRate: number };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Remaining query budget, used by bulk jobs to pace themselves. */
export const budget = { available: 1000, restoreRate: 50, max: 1000 };

export async function gql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  let attempt = 0;
  for (;;) {
    attempt += 1;
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, variables }),
      });
    } catch (error) {
      if (attempt < 3) {
        await sleep(400 * attempt);
        continue;
      }
      throw new ApiError(`Network error talking to Shopify: ${(error as Error).message}`);
    }

    if (response.status === 429 || response.status >= 500) {
      if (attempt < 6) {
        await sleep(Math.min(8000, 500 * 2 ** attempt));
        continue;
      }
      throw new ApiError(`Shopify is busy (HTTP ${response.status}). Please try again.`, [], response.status);
    }
    if (response.status === 401 || response.status === 403) {
      throw new ApiError(
        "Shopify refused the request. Make sure the app is installed with its latest permissions (reload the app).",
        [],
        response.status,
      );
    }

    let json: { data?: T; errors?: GraphQLErrorItem[]; extensions?: { cost?: CostInfo } };
    try {
      json = await response.json();
    } catch {
      throw new ApiError(`Unexpected response from Shopify (HTTP ${response.status}).`, [], response.status);
    }

    const cost = json.extensions?.cost;
    if (cost?.throttleStatus) {
      budget.available = cost.throttleStatus.currentlyAvailable;
      budget.restoreRate = cost.throttleStatus.restoreRate;
      budget.max = cost.throttleStatus.maximumAvailable;
    }

    const throttled = json.errors?.some((e) => e.extensions?.code === "THROTTLED");
    if (throttled && attempt < 8) {
      const needed = cost?.requestedQueryCost ?? 200;
      const missing = Math.max(0, needed - (cost?.throttleStatus?.currentlyAvailable ?? 0));
      const rate = cost?.throttleStatus?.restoreRate || 50;
      await sleep(Math.max(500, (missing / rate) * 1000 + 250));
      continue;
    }
    if (json.errors?.length) {
      throw new ApiError(json.errors.map((e) => e.message).join("; "), json.errors, response.status);
    }
    if (!json.data) throw new ApiError("Shopify returned no data.");
    return json.data;
  }
}

/** Wait until the API bucket has at least `cost` points (bulk jobs call this between requests). */
export async function waitForBudget(cost: number): Promise<void> {
  if (budget.available >= cost) return;
  const missing = cost - budget.available;
  await sleep((missing / Math.max(1, budget.restoreRate)) * 1000 + 100);
  budget.available = cost;
}

export function throwUserErrors(errors: UserError[] | null | undefined, context: string): void {
  if (errors && errors.length) {
    throw new ApiError(`${context}: ${errors.map((e) => e.message).join("; ")}`);
  }
}

export const gidToId = (gid: string | null | undefined): number => {
  const m = gid ? /\/(\d+)(?:\?.*)?$/.exec(gid) : null;
  return m ? Number(m[1]) : 0;
};

export const toGid = (type: string, id: number | string): string => `gid://shopify/${type}/${id}`;
