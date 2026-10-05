## What does Target Product Scraper do?

Target Product Scraper collects structured product listings from Target.com search results. Enter a Target search keyword or a public Target listing URL, choose how many products to collect, and receive records with product names, brands, prices, ratings, availability, images, category identifiers, marketplace status, and product URLs.

The dataset is useful for price monitoring, competitor assortment tracking, product research, merchandising analysis, and ecommerce data pipelines. Results can be exported from Apify in JSON, CSV, Excel, XML, and other supported formats, or connected to an API, webhook, Google Sheets, Make, or Zapier workflow.

## Why use Target Product Scraper?

- **Target product research** - Build a searchable dataset for categories, brands, seasonal products, and shopping trends.
- **Price monitoring** - Compare current displayed prices, regular prices, comparison prices, and rating signals across repeated runs.
- **Assortment analysis** - Track which products and brands appear for important search terms and how product coverage changes over time.
- **Availability checks** - Capture shipping and scheduled delivery availability where Target publishes those signals.
- **Marketplace analysis** - Identify products sold through Target’s marketplace using the `is_marketplace` field.
- **Automation-ready data** - Run on demand or on a schedule, download the dataset, or pass results to downstream systems through Apify integrations.

## What data can you extract from Target?

Each dataset item represents one product listing. Empty values are omitted when Target does not publish a field for a product.

| Field                             | Description                                                 |
| --------------------------------- | ----------------------------------------------------------- |
| `title`                           | Product title shown in the Target listing.                  |
| `brand`                           | Product brand name.                                         |
| `tcin`                            | Target product identifier.                                  |
| `parent_tcin`                     | Parent identifier for a product variation group.            |
| `formatted_current_price`         | Current displayed price or price range.                     |
| `formatted_comparison_price`      | Comparison or regular price displayed by Target.            |
| `current_retail`                  | Numeric current retail price when available.                |
| `reg_retail`                      | Numeric regular retail price when available.                |
| `rating_average`                  | Average customer rating.                                    |
| `rating_count`                    | Number of ratings.                                          |
| `review_overall_sentiment`        | Review summary sentiment when available.                    |
| `shipping_availability`           | Shipping availability status.                               |
| `scheduled_delivery_availability` | Scheduled delivery availability status.                     |
| `is_marketplace`                  | Indicates whether the item is a marketplace product.        |
| `item_type`                       | Target product classification.                              |
| `vendor_name`                     | Vendor or seller name when available.                       |
| `department_id`                   | Target department identifier.                               |
| `category_id`                     | Target category identifier.                                 |
| `parent_category_id`              | Parent category identifier.                                 |
| `buy_url`                         | Direct Target product page URL.                             |
| `primary_image_url`               | Main product image URL.                                     |
| `alternate_image_urls`            | Additional product image URLs.                              |
| `promotions`                      | Promotion identifiers or messages associated with the item. |
| `search_keyword`                  | Keyword used for the run.                                   |
| `position`                        | Product position in the collected result flow.              |
| `page`                            | Listing page where the item was collected.                  |
| `current_page`                    | Page number reported by Target metadata.                    |
| `total_pages`                     | Total pages reported by Target metadata.                    |
| `result_offset`                   | Result offset used for the page.                            |
| `sort_by`                         | Sort option used for the run.                               |
| `scraped_at`                      | ISO timestamp for the collected record.                     |

## How to scrape Target product data

1. Open Target Product Scraper on Apify.
2. Enter a search keyword, or provide a public Target listing URL in `startUrl`.
3. Set the result limit and pagination cap.
4. Choose relevance or newest sorting and decide whether sponsored products should be included.
5. Start the run and review the dataset preview.
6. Download the results or connect the dataset to your next workflow.

Use `keyword` or `startUrl` as one search mode. If both are present, `keyword` takes precedence and the URL is ignored. When neither is provided, the Actor uses its configured coffee search URL. The `startUrl` value is both the single UI prefill and the schema default; the runtime also uses the same documented default if the run input is empty. Omitted result controls use their own runtime defaults, while explicit values are preserved.

## Input Parameters

| Parameter            | Type    | Required | Default / UI prefill       | Description                                                                       |
| -------------------- | ------- | -------- | -------------------------- | --------------------------------------------------------------------------------- |
| `startUrl`           | String  | No*      | `https://www.target.com/s?searchTerm=coffee` (default and UI prefill) | Public Target listing URL, used when `keyword` is empty. |
| `keyword`            | String  | No*      | None                       | Search keyword used to collect products. Provide this or a valid `startUrl`.      |
| `sort_by`            | String  | No       | `relevance`                | Result order. Supported values are `relevance` and `newest`.                      |
| `results_wanted`     | Integer | No       | `20`                       | Maximum number of products to save. Minimum value is `1`.                         |
| `max_pages`          | Integer | No       | `10`                       | Maximum number of listing pages to process. Minimum value is `1`.                 |
| `include_sponsored`  | Boolean | No       | `true`                     | Include sponsored products in the dataset.                                        |
| `proxyConfiguration` | Object  | No       | US residential Apify Proxy (enabled) | Proxy configuration for the run. A rotating US residential proxy is used by default to keep collection reliable. |

`*` A usable search value is always available: the Actor uses a supplied `keyword`, then a supplied `startUrl`, and falls back to its configured default URL when neither is present. When both search fields are present, only `keyword` is used.

## Usage Examples

### Basic keyword search

Collect up to 20 products for a Target search term.

```json
{
    "keyword": "womens tops",
    "results_wanted": 20
}
```

### Collection from a Target search URL

Use a complete Target search URL when the URL already contains the category or search context you need.

```json
{
    "startUrl": "https://www.target.com/s?searchTerm=womens+tops&category=0%7CAll%7Cmatchallpartial%7Call+categories&searchTermRaw=womw",
    "results_wanted": 50,
    "max_pages": 5
}
```

### Newest products without sponsored listings

Collect a larger result set sorted by newest products and exclude sponsored items.

```json
{
    "keyword": "running shoes",
    "sort_by": "newest",
    "results_wanted": 100,
    "max_pages": 10,
    "include_sponsored": false
}
```

## Output Data

Each dataset item is one product record. Unavailable fields may be omitted.

| Field                             | Type    | Description                           |
| --------------------------------- | ------- | ------------------------------------- |
| `title`                           | String  | Product name.                         |
| `tcin`                            | String  | Target product identifier.            |
| `brand`                           | String  | Brand name.                           |
| `formatted_current_price`         | String  | Displayed price or price range.       |
| `current_retail`                  | Number  | Numeric current price when available. |
| `rating_average`                  | Number  | Average rating.                       |
| `rating_count`                    | Integer | Number of ratings.                    |
| `shipping_availability`           | String  | Shipping status.                      |
| `scheduled_delivery_availability` | String  | Scheduled delivery status.            |
| `is_marketplace`                  | Boolean | Marketplace product indicator.        |
| `item_type`                       | String  | Product classification.               |
| `buy_url`                         | String  | Direct product page URL.              |
| `primary_image_url`               | String  | Main image URL.                       |
| `alternate_image_urls`            | Array   | Additional image URLs.                |
| `promotions`                      | Array   | Product promotions when available.    |
| `search_keyword`                  | String  | Search term used in the run.          |
| `position`                        | Integer | Product position in the result flow.  |
| `page`                            | Integer | Collected listing page.               |
| `sort_by`                         | String  | Sort order used.                      |
| `scraped_at`                      | String  | ISO collection timestamp.             |

## Sample Output

This is an example of one product record returned by the dataset.

```json
{
    "position": 1,
    "page": 1,
    "search_keyword": "running shoes",
    "tcin": "89513491",
    "parent_tcin": "87193107",
    "title": "Women's Running Shoe",
    "brand": "Example Brand",
    "formatted_current_price": "$28.99",
    "current_retail": 28.99,
    "rating_average": 4.4,
    "rating_count": 128,
    "shipping_availability": "IN_STOCK",
    "scheduled_delivery_availability": "IN_STOCK",
    "is_marketplace": false,
    "item_type": "Athletic Shoes",
    "department_id": 287,
    "category_id": "shoes",
    "buy_url": "https://www.target.com/p/example-running-shoe/-/A-89513491",
    "primary_image_url": "https://target.scene7.com/is/image/Target/example",
    "alternate_image_urls": ["https://target.scene7.com/is/image/Target/example-alt"],
    "sort_by": "relevance",
    "current_page": 1,
    "total_pages": 10,
    "result_offset": 0,
    "scraped_at": "2026-08-03T10:30:00.000Z"
}
```

## Tips for Best Results

- **Use specific keywords** - Terms such as `women's running shoes`, `4K TVs`, or `organic coffee` produce more focused datasets than broad terms.
- **Start with a small limit** - Test with 20 results before increasing `results_wanted` for a large collection.
- **Use the page cap as a guardrail** - Increase `max_pages` when you need deeper coverage, while keeping the run size predictable.
- **Review the dataset preview** - Confirm price, availability, category, and URL fields before scheduling repeat runs.
- **Expect source variation** - Marketplace products and regular Target products may expose different fields. Missing values usually mean the source listing did not publish that information.
- **Schedule repeat runs for monitoring** - Compare datasets over time to identify price, rating, assortment, or availability changes.

## Integrations and Export Formats

- **Google Sheets** - Review product prices, brands, and availability in a shared spreadsheet.
- **Airtable** - Build a searchable product catalog for merchandising or research teams.
- **Webhooks** - Notify another system when a run finishes.
- **Make or Zapier** - Send product records to no-code workflows.
- **Apify API** - Read dataset items from an application or data pipeline.
- **JSON, CSV, Excel, and XML** - Export results for analysis, reporting, or system imports.

## Frequently Asked Questions

### Can I scrape Target products by keyword?

Yes. Provide a search term in `keyword`, set a result limit, and run the Actor.

### Can I use a full Target search URL?

Yes. Add a public Target listing URL to `startUrl`. The Actor reads the search context from supported listing URLs.

### Does the Actor collect prices and availability?

Yes. Output can include displayed and numeric prices, comparison prices, shipping status, scheduled delivery status, sold-out indicators, and marketplace status when Target provides them.

### Does it include sponsored products?

Yes, sponsored products are included by default. Set `include_sponsored` to `false` to exclude them.

### How many products can I collect?

The Actor stops when it reaches `results_wanted`, reaches `max_pages`, or no additional products are available. The practical result count also depends on the Target search results.

### Can I run it on a schedule?

Yes. Create an Apify schedule to repeat the run hourly, daily, weekly, or at another interval supported by your workflow.

### Why is a field missing from one product?

Target does not publish every attribute for every listing. The dataset omits unavailable values, so compare several records before treating a field as universally present.

### Is it legal to collect Target data?

You are responsible for complying with Target’s terms, applicable laws, privacy requirements, and any restrictions associated with the data you collect. Use the Actor for legitimate research, monitoring, and business workflows.

## Related Actors

- [Target Reviews Scraper](https://apify.com/shahidirfan/target-reviews-scraper) - Collect customer reviews, ratings, and feedback from Target product pages.
- [Shopify Product Scraper](https://apify.com/shahidirfan/shopify-product-scraper) - Collect normalized product and variant data from Shopify-powered stores.
- [Trendyol Product Scraper](https://apify.com/shahidirfan/trendyol-product-scraper) - Collect product names, prices, ratings, reviews, images, and URLs from Trendyol search results.

## Support

For issues, feature requests, or target-site changes, use the Issues tab on the Actor page in Apify Console. Include the input used, run ID, and a short description of the unexpected result when requesting help.

## Legal Notice

This Actor is intended for legitimate collection and analysis of publicly available Target.com product information. Users are responsible for complying with Target’s website terms, applicable laws, privacy obligations, and any requirements governing the use or redistribution of collected data.
