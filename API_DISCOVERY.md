## Selected API

- Endpoint: https://redsky.target.com/redsky_aggregations/v1/web/plp_search_v2
- Method: GET
- Auth: No user auth required (public API key in request)
- Pagination: offset + count (metadata includes current_page, total_pages, total_results)
- Required params verified: key, channel, keyword, offset, count, page, platform, pricing_store_id, visitor_id
- Optional params used: category, searchTermRaw, sort_by, include_sponsored
- Fields available: product identifiers, title, brand, links, pricing, ratings, item classification, marketplace flags, image URLs, vendor info, bullets, and response metadata
- Fields currently missing in actor: all product-level commerce fields (old actor was unrelated Remote.co jobs output)
- Field count: >30 practical fields available vs 0 relevant Target fields previously

## API Scoring

- Returns JSON directly: +30
- Has >15 unique fields: +25
- No auth required: +20
- Has pagination support: +15
- Matches or extends current fields: +10
- Total score: 100

## Notes

- Tested successfully with live request in local terminal.
- The endpoint returns data under data.search.products and pagination metadata under data.search.search_response.metadata.
- Response includes all key fields needed for production Target product scraping without HTML parsing.
