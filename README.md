# Target Product Scraper

Collect paginated product listings from Target search with resilient request handling and rich product details ready for analysis, monitoring, and automation. This actor helps you build structured datasets for pricing intelligence, assortment tracking, and catalog research.

---

## Features

- **Search-focused extraction** - Collect products by keyword or search URL.
- **Rich product fields** - Capture title, pricing, ratings, brand, images, and product links.
- **Reliable pagination** - Gather results across multiple pages with offset-based pagination that self-recovers when Target changes request behavior.
- **Marketplace visibility** - Identify marketplace items directly in output.
- **Runtime diagnosis** - When Target changes headers or endpoint behavior, the actor re-reads the documented API flow and probes live endpoints before falling back.
- **Clean dataset output** - Records are saved without empty null fields.

---

## Use Cases

### Price Monitoring
Track price changes and comparisons over time for selected categories or seasonal keywords.

### Competitor Assortment Tracking
Analyze which products, brands, and item types are appearing for key searches.

### Product Research
Build focused datasets for market research, trend reporting, or merchandising analysis.

### Ratings Intelligence
Review product rating averages and rating counts for quality and demand insights.

---

## Input Parameters

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `startUrl` | String | No | Example prefill | Target search URL. If set, keyword and related values are inferred from it. |
| `keyword` | String | No | `"womens tops"` | Search keyword used for product collection. |
| `sort_by` | String | No | `"relevance"` | Sort mode (`relevance`, `newest`). |
| `results_wanted` | Integer | No | `20` | Maximum number of products to collect. |
| `max_pages` | Integer | No | `10` | Maximum pages to process. |
| `include_sponsored` | Boolean | No | `true` | Include sponsored products in results. |
| `proxyConfiguration` | Object | No | Disabled | Proxy settings for reliability. |

Store context and visitor identifier are handled internally by the actor. If your `startUrl` already includes those query parameters, they are respected and refreshed when needed.

---

## Output Data

Each dataset item may include the following fields:

| Field | Type | Description |
|---|---|---|
| `position` | Integer | Product position in result flow. |
| `page` | Integer | Page number where the product was collected. |
| `search_keyword` | String | Keyword used in the run. |
| `tcin` | String | Target product identifier. |
| `parent_tcin` | String | Parent identifier for variation groups. |
| `title` | String | Product title. |
| `brand` | String | Product brand. |
| `formatted_current_price` | String | Current displayed price. |
| `formatted_comparison_price` | String | Comparison price if available. |
| `current_retail` | Number | Current numeric retail price when available. |
| `reg_retail` | Number | Regular retail price when available. |
| `rating_average` | Number | Average star rating. |
| `rating_count` | Integer | Number of ratings. |
| `shipping_availability` | String | Shipping stock status. |
| `scheduled_delivery_availability` | String | Scheduled delivery stock status. |
| `free_shipping_enabled` | Boolean | Free shipping flag. |
| `is_marketplace` | Boolean | Marketplace flag. |
| `item_type` | String | Product classification label. |
| `department_id` | Integer | Target department ID. |
| `category_id` | String | Category identifier returned by Target. |
| `parent_category_id` | String | Parent category identifier. |
| `review_overall_sentiment` | String | Review summary sentiment when available. |
| `promotions` | Array | Promotion identifiers or messages present on the item. |
| `ornaments` | Array | Merchandising callouts shown on the listing page. |
| `buy_url` | String | Product page URL. |
| `primary_image_url` | String | Main product image. |
| `alternate_image_urls` | Array | Additional product image URLs. |
| `swatch_image_url` | String | Swatch or color preview image. |
| `response_id` | String | Result response identifier. |
| `sort_by` | String | Sort mode used in request. |
| `current_page` | Integer | Listing page number from Target metadata. |
| `total_pages` | Integer | Total number of pages reported by Target. |
| `result_offset` | Integer | Offset used for the current page. |
| `scraped_at` | String | Record timestamp in ISO format. |

---

## Usage Examples

### Basic Search

```json
{
	"keyword": "womens tops",
	"results_wanted": 20
}
```

### Start URL Driven Collection

```json
{
	"startUrl": "https://www.target.com/s?searchTerm=womens+tops&category=0%7CAll%7Cmatchallpartial%7Call+categories&searchTermRaw=womw",
	"results_wanted": 50,
	"max_pages": 5
}
```

### Sorted Collection with Store Context

```json
{
	"keyword": "running shoes",
	"sort_by": "newest",
	"results_wanted": 100,
	"max_pages": 10
}
```

---

## Sample Output

```json
{
	"position": 1,
	"page": 1,
	"search_keyword": "womens tops",
	"tcin": "89513491",
	"parent_tcin": "87193107",
	"title": "INSPIRE CHIC Women's Ruffle V Neck Puff Sleeve Summer Casual Chiffon Peasant Top X-Large Black",
	"brand": "INSPIRE CHIC",
	"formatted_current_price": "$28.99 - $31.99",
	"formatted_comparison_price": "$38.69 - $42.69",
	"current_retail": 28.99,
	"rating_average": 3.62,
	"rating_count": 18,
	"shipping_availability": "IN_STOCK",
	"scheduled_delivery_availability": "OUT_OF_STOCK",
	"is_marketplace": true,
	"item_type": "Shirts",
	"department_id": 287,
	"category_id": "9qjry",
	"buy_url": "https://www.target.com/p/allegra-k-women-s-ruffle-v-neck-puff-sleeve-summer-casual-chiffon-peasant-top-black-x-large/-/A-89513491",
	"primary_image_url": "https://target.scene7.com/is/image/Target/GUEST_98f735e4-29c7-4875-bafc-fbded857596a",
	"alternate_image_urls": [
		"https://target.scene7.com/is/image/Target/GUEST_alt_example"
	],
	"response_id": "search-31762b4a-701d-424d-b792-94adc23d8614",
	"sort_by": "relevance",
	"current_page": 1,
	"total_pages": 50,
	"result_offset": 0,
	"scraped_at": "2026-04-07T08:00:00.000Z"
}
```

---

## Tips For Best Results

### Use Specific Keywords
Targeted search terms improve relevance and make downstream analysis easier.

### Start Small, Then Scale
Begin with `results_wanted` set to `20` for quick validation, then increase gradually.

### Configure Proxy For Reliability
Residential proxy settings improve consistency for larger data collection runs.

### Tune Pagination Safely
Use `max_pages` as a guardrail to control runtime and data volume.

---

## Integrations

- **Google Sheets** - Export product datasets for quick analysis.
- **Airtable** - Build searchable product tracking tables.
- **Make** - Trigger automated workflows after each run.
- **Zapier** - Send product events to business tools.
- **Webhooks** - Deliver fresh data to custom systems.

### Export Formats

- **JSON** - Programmatic workflows and APIs
- **CSV** - Spreadsheet and BI analysis
- **Excel** - Business reporting
- **XML** - System integrations

---

## Frequently Asked Questions

### How many products can I collect?
You can collect as many as available for your search, limited by your `results_wanted` and `max_pages` settings.

### Can I use a full Target search URL?
Yes. Provide `startUrl` and the actor will use it as the source for search settings.

### Why do some items have fewer fields?
Some products may not publish every attribute. The actor saves only available values and excludes nulls.

### Does this support pagination automatically?
Yes. The actor moves through result pages until limits are reached.

### Is sponsored content included?
Yes by default. You can disable it using `include_sponsored`.

---

## Support

For issues or feature requests, use the Apify Console issue and support channels.

### Resources

- [Apify Documentation](https://docs.apify.com/)
- [Apify API Reference](https://docs.apify.com/api/v2)
- [Apify Scheduling](https://docs.apify.com/platform/schedules)

---

## Legal Notice

This actor is intended for legitimate data collection and analysis. Users are responsible for complying with website terms and applicable laws in their jurisdiction.
