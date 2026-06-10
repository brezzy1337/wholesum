import { z } from "zod/v4";

/**
 * Minimal Instacart Developer Platform (IDP) Public API client.
 *
 * Contract source: docs.instacart.com, verified 2026-06-10.
 * `GET {baseUrl}/idp/v1/retailers?postal_code=<string>&country_code=<US|CA>`
 * with `Authorization: Bearer <api key>`.
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
 * key, request headers, or raw response bodies.
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
}

export function createInstacartClient(
  config: InstacartClientConfig,
): InstacartClient {
  const { apiKey } = config;
  const baseUrl = config.baseUrl ?? INSTACART_PROD_BASE_URL;

  return {
    async getNearbyRetailers(params) {
      const query = new URLSearchParams({
        postal_code: params.postalCode,
        country_code: params.countryCode,
      });
      const url = `${baseUrl}/idp/v1/retailers?${query.toString()}`;

      let response: Response;
      try {
        response = await fetch(url, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            Accept: "application/json",
          },
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

      const parsed = NearbyRetailersResponseSchema.safeParse(body);
      if (!parsed.success) {
        throw new InstacartApiError(
          `Instacart returned a malformed response (status ${response.status}, unexpected body shape)`,
          response.status,
        );
      }

      return parsed.data.retailers.flatMap((retailer) => {
        if (!retailer.retailer_key || !retailer.name) return [];
        return [
          {
            retailerKey: retailer.retailer_key,
            name: retailer.name,
            retailerLogoUrl: retailer.retailer_logo_url ?? null,
          },
        ];
      });
    },
  };
}
