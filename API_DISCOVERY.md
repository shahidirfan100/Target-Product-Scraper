## Selected API

- Endpoint: `https://cdui-orchestrations.target.com/cdui_orchestrations/v1/pages/slp`
- Method: `GET`
- Auth: No account auth required, but modern browser headers and runtime page context are required for stable access
- Pagination: `offset + count` with metadata under `data_source_modules[].module_data.search_response.search_response.metadata`
- Required params verified: `key`, `platform`, `channel`, `page`, `sapphire_page`, `visitor_id`, `keyword`, `offset`, `count`, `store_id`, `scheduled_delivery_store_id`, `zip`, `state`
- Supporting bootstrap endpoint: `https://sapphire-api.target.com/sapphire/runtime/api/v1/raw/www.target.com/s`
- Fields available: product identifiers, title, brand, URLs, pricing, ratings, review summary, fulfillment, shipping availability, swatches, category IDs, image URLs, promotions, ornaments, and pagination metadata
- Field count: 30+ practical product fields with stable pagination metadata

## Why This API Won

- Returns rich JSON directly and paginates cleanly with `offset=24`, `48`, and beyond.
- Works with `got-scraping` from a browser-like request profile.
- Exposes the same product objects the listing page renders, plus search metadata in one response.
- Keeps the actor fully HTTP-based without Playwright in production.

## Supporting Runtime Flow

1. Read this file before diagnosing a live failure.
2. Bootstrap a fresh visitor/runtime context from the Sapphire endpoint.
3. Send the listing request to the CDUI endpoint with `got-scraping`.
4. Parse products from `data_source_modules[].module_data.search_response.products`.
5. Parse pagination metadata from `data_source_modules[].module_data.search_response.search_response.metadata`.

## Rejected / Fallback Candidates

### Legacy RedSky listing endpoint

- Endpoint: `https://redsky.target.com/redsky_aggregations/v1/web/plp_search_v2`
- Result: unreliable for current Target search traffic
- Rejection reason:
  - Returned `Search request failed` on page 2 in actor logs.
  - Returned `403` / captcha-related behavior during live browser inspection.
  - Requires a more fragile parameter/header mix than the current CDUI listing endpoint.
- Fallback status: keep only as a diagnostic probe, not as the primary paginator.

### Sapphire runtime endpoint

- Endpoint: `https://sapphire-api.target.com/sapphire/runtime/api/v1/raw/www.target.com/s`
- Result: useful for visitor/runtime bootstrap, not for product extraction
- Rejection reason:
  - Returns runtime/config payloads, not the paginated product listing itself.

## Live Validation Notes

- Browser inspection on June 19, 2026 showed the page requesting CDUI listing data successfully while several RedSky follow-up calls returned `403`.
- Direct `got-scraping` probes confirmed the CDUI endpoint returned page 1, page 2, and page 3 data with `offset=0/24/48`.
- Metadata verified:
  - `current_page` increments correctly.
  - `total_pages` and `total_results` are present.
  - `count` remains `24`, matching the intended pagination step.

## Auto-Healing Guidance

- If the actor fails, read this file first, then probe the documented endpoints with `got-scraping`.
- Prefer CDUI for recovery.
- Use Sapphire only to refresh runtime context values like `visitor_id` and page identity.
- If CDUI stops returning products, log top-level response keys and probe Legacy RedSky only for diagnosis.
