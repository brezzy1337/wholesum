import { z } from "zod/v4";

/**
 * Minimal Instacart Developer Platform (IDP) Public API client.
 *
 * Contract source: docs.instacart.com, verified 2026-06-10.
 * - `GET {baseUrl}/idp/v1/retailers?postal_code=<string>&country_code=<US|CA>`
 * - `POST {baseUrl}/idp/v1/products/products_link`
 * Both with `Authorization: Bearer <api key>`.
 *
 * Production and development environments use SEPARATE API keys — a key for
 * one base URL will not work against the other. Server-side use only; the API
 * key must never reach a client.
 */

export const INSTACART_PROD_BASE_URL = "https://connect.instacart.com";
export const INSTACART_DEV_BASE_URL = "https://connect.dev.instacart.tools";

const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Error thrown for any failed Instacart API interaction.
 *
 * `status` is the HTTP status of the response, or `null` when the failure
 * happened before a response existed (network error, timeout) or while
 * reading it. Messages are intentionally terse — they never include the API
 * key, request headers, or raw response bodies. The HTTP status line
 * (status code + reason phrase) may appear; nothing beyond it.
 */
export class InstacartApiError extends Error {
  readonly status: number | null;

  constructor(message: string, status: number | null) {
    super(message);
    this.name = "InstacartApiError";
    this.status = status;
  }
}

/**
 * The docs mark the array and every retailer field optional, so everything
 * here must tolerate absence. Entries without a usable `retailer_key` or
 * `name` are dropped after parsing.
 */
const NearbyRetailersResponseSchema = z.object({
  retailers: z
    .array(
      z.object({
        retailer_key: z.string().optional(),
        name: z.string().optional(),
        retailer_logo_url: z.string().optional(),
      }),
    )
    .optional()
    .default([]),
});

export interface NearbyRetailer {
  retailerKey: string;
  name: string;
  retailerLogoUrl: string | null;
}

/**
 * 200 response of `POST /idp/v1/products/products_link`. The URL is handed to
 * browsers downstream, so we require https as defence in depth.
 */
const ProductsLinkResponseSchema = z.object({
  products_link_url: z.string().startsWith("https://"),
});

/** One line item on a products link. `name` is a product search term. */
export interface ProductsLinkLineItem {
  name: string;
  /** Optional display label shown to the user instead of `name`. */
  displayText?: string;
  /** Defaults to 1 on the Instacart side. */
  quantity?: number;
  /** Defaults to "each" on the Instacart side. */
  unit?: string;
}

export interface CreateProductsLinkParams {
  title: string;
  lineItems: ProductsLinkLineItem[];
  /** Days until the link expires; the API caps this at 365. */
  expiresInDays?: number;
  instructions?: string[];
}

export interface ProductsLink {
  /** The shareable Instacart shopping-list page URL (always https). */
  url: string;
}

export interface InstacartClientConfig {
  apiKey: string;
  /** Defaults to {@link INSTACART_PROD_BASE_URL}. */
  baseUrl?: string;
}

export interface GetNearbyRetailersParams {
  postalCode: string;
  countryCode: "US" | "CA";
}

export interface InstacartClient {
  getNearbyRetailers(
    params: GetNearbyRetailersParams,
  ): Promise<NearbyRetailer[]>;
  /**
   * Creates an Instacart shopping-list page from a list of product search
   * terms (`POST /idp/v1/products/products_link`).
   *
   * NOTE: the public products-link API has NO retailer/retailer_key field —
   * store selection happens on the Instacart page itself. A plan's stored
   * `retailerKey` cannot target this link at a specific store; revisit with
   * the post-MVP Catalog/Connect API swap.
   */
  createProductsLink(params: CreateProductsLinkParams): Promise<ProductsLink>;
}

/** The only hosts this client will ever talk to (SSRF guard on config). */
const ALLOWED_HOSTS = new Set(
  [INSTACART_PROD_BASE_URL, INSTACART_DEV_BASE_URL].map(
    (u) => new URL(u).host,
  ),
);

export function createInstacartClient(
  config: InstacartClientConfig,
): InstacartClient {
  const { apiKey } = config;

  let parsedBaseUrl: URL;
  try {
    parsedBaseUrl = new URL(config.baseUrl ?? INSTACART_PROD_BASE_URL);
  } catch {
    throw new Error("Invalid Instacart base URL configuration");
  }
  if (
    parsedBaseUrl.protocol !== "https:" ||
    !ALLOWED_HOSTS.has(parsedBaseUrl.host)
  ) {
    throw new Error(
      "Instacart base URL must be https and a known Instacart host",
    );
  }
  // `origin` normalizes away trailing slashes/paths from operator config.
  const baseUrl = parsedBaseUrl.origin;

  /**
   * Shared fetch scaffolding: auth header, 10s timeout, terse errors (status
   * line only — never the key, headers, or response bodies). When `jsonBody`
   * is provided the request is sent as JSON; otherwise no body or
   * Content-Type header is sent.
   */
  async function requestJson(
    path: string,
    init: { method: "GET" | "POST"; jsonBody?: unknown },
  ): Promise<{ status: number; body: unknown }> {
    let response: Response;
    try {
      response = await fetch(`${baseUrl}${path}`, {
        method: init.method,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json",
          ...(init.jsonBody !== undefined && {
            "Content-Type": "application/json",
          }),
        },
        ...(init.jsonBody !== undefined && {
          body: JSON.stringify(init.jsonBody),
        }),
        signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
      });
    } catch {
      throw new InstacartApiError(
        "Instacart request failed before a response was received (network error or timeout)",
        null,
      );
    }

    if (!response.ok) {
      throw new InstacartApiError(
        `Instacart request failed: ${response.status} ${response.statusText}`,
        response.status,
      );
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new InstacartApiError(
        `Instacart returned a malformed response (status ${response.status}, body is not valid JSON)`,
        response.status,
      );
    }

    return { status: response.status, body };
  }

  return {
    async getNearbyRetailers(params) {
      const query = new URLSearchParams({
        postal_code: params.postalCode,
        country_code: params.countryCode,
      });
      const { status, body } = await requestJson(
        `/idp/v1/retailers?${query.toString()}`,
        { method: "GET" },
      );

      const parsed = NearbyRetailersResponseSchema.safeParse(body);
      if (!parsed.success) {
        throw new InstacartApiError(
          `Instacart returned a malformed response (status ${status}, unexpected body shape)`,
          status,
        );
      }

      return parsed.data.retailers.flatMap((retailer) => {
        if (!retailer.retailer_key || !retailer.name) return [];
        // Defence in depth for future UI rendering: only https logo URLs.
        const logoUrl = retailer.retailer_logo_url?.startsWith("https://")
          ? retailer.retailer_logo_url
          : null;
        return [
          {
            retailerKey: retailer.retailer_key,
            name: retailer.name,
            retailerLogoUrl: logoUrl,
          },
        ];
      });
    },

    async createProductsLink(params) {
      // NOTE: the public products-link contract has no retailer/retailer_key
      // field — the user picks the store on the Instacart page itself.
      const requestBody = {
        title: params.title,
        link_type: "shopping_list",
        ...(params.expiresInDays !== undefined && {
          expires_in: params.expiresInDays,
        }),
        ...(params.instructions !== undefined && {
          instructions: params.instructions,
        }),
        line_items: params.lineItems.map((item) => ({
          name: item.name,
          ...(item.quantity !== undefined && { quantity: item.quantity }),
          ...(item.unit !== undefined && { unit: item.unit }),
          ...(item.displayText !== undefined && {
            display_text: item.displayText,
          }),
        })),
      };

      const { status, body } = await requestJson(
        "/idp/v1/products/products_link",
        { method: "POST", jsonBody: requestBody },
      );

      const parsed = ProductsLinkResponseSchema.safeParse(body);
      if (!parsed.success) {
        throw new InstacartApiError(
          `Instacart returned a malformed response (status ${status}, unexpected body shape)`,
          status,
        );
      }

      return { url: parsed.data.products_link_url };
    },
  };
}
