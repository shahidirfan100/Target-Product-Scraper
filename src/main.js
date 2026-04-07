import { randomBytes } from 'node:crypto';
import { Actor, log } from 'apify';
import { Dataset } from 'crawlee';
import { gotScraping } from 'got-scraping';

const TARGET_API_URL = 'https://redsky.target.com/redsky_aggregations/v1/web/plp_search_v2';
const TARGET_API_KEY = '9f36aeafbe60771e321a7cc95a78140772ab3e96';
const PAGE_SIZE_LIMIT = 24;
const DEFAULT_PRICING_STORE_ID = '3991';

const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:147.0) Gecko/20100101 Firefox/147.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 15.7; rv:147.0) Gecko/20100101 Firefox/147.0',
    'Mozilla/5.0 (X11; Linux x86_64; rv:147.0) Gecko/20100101 Firefox/147.0',
];

const randomUserAgent = () => USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

const toPositiveInt = (value, fallback) => {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 1) return fallback;
    return Math.floor(n);
};

const randomVisitorId = () => randomBytes(16).toString('hex').toUpperCase();

const trimToUndefined = (value) => {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed || undefined;
};

const isListingPath = (pathname) => {
    return /^\/(s|c|b|sp|pl)(\/|$)/.test(pathname);
};

const keywordFromPathname = (pathname) => {
    const segments = pathname.split('/').filter(Boolean);
    if (segments.length < 2) return undefined;

    if (segments[0] === 's') {
        return trimToUndefined(decodeURIComponent(segments[1]).replace(/\+/g, ' '));
    }

    if (segments[0] === 'c' || segments[0] === 'b' || segments[0] === 'sp' || segments[0] === 'pl') {
        const slug = trimToUndefined(decodeURIComponent(segments[1]).replace(/[-+]/g, ' '));
        if (!slug) return undefined;

        const firstToken = slug.split(/\s+/).find((token) => token.length > 1);
        return trimToUndefined(firstToken) || slug;
    }

    return undefined;
};

const buildPagePath = (keyword, startUrl) => {
    if (startUrl) {
        try {
            const parsed = new URL(startUrl);
            if (isListingPath(parsed.pathname)) return parsed.pathname;
        } catch {
            // Ignore invalid URL and build from keyword.
        }
    }
    return `/s/${encodeURIComponent(keyword).replace(/%20/g, '+')}`;
};

const parseStartUrl = (startUrl) => {
    if (!startUrl) return {};
    try {
        const parsed = new URL(startUrl);
        const searchTermFromPath = keywordFromPathname(parsed.pathname);
        const searchTermFromQuery = trimToUndefined(parsed.searchParams.get('searchTerm'));
        const pricingStoreIdFromQuery = trimToUndefined(parsed.searchParams.get('pricing_store_id'));
        const visitorIdFromQuery = trimToUndefined(parsed.searchParams.get('visitor_id'));

        return {
            keyword: searchTermFromQuery || searchTermFromPath,
            pagePath: isListingPath(parsed.pathname) ? parsed.pathname : undefined,
            pricingStoreId: pricingStoreIdFromQuery,
            visitorId: visitorIdFromQuery,
        };
    } catch {
        return {};
    }
};

const cleanValue = (value) => {
    if (value === null || value === undefined) return undefined;

    if (Array.isArray(value)) {
        const cleanedArray = value
            .map(cleanValue)
            .filter((item) => item !== undefined)
            .filter((item) => !(Array.isArray(item) && item.length === 0))
            .filter((item) => !(typeof item === 'object' && item !== null && !Array.isArray(item) && Object.keys(item).length === 0));
        return cleanedArray.length ? cleanedArray : undefined;
    }

    if (typeof value === 'object') {
        const cleanedObject = Object.entries(value).reduce((acc, [key, val]) => {
            const cleaned = cleanValue(val);
            if (cleaned !== undefined) acc[key] = cleaned;
            return acc;
        }, {});
        return Object.keys(cleanedObject).length ? cleanedObject : undefined;
    }

    if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed === '' ? undefined : trimmed;
    }

    return value;
};

const mapProduct = (product, keyword, metadata, pageNo, position) => {
    const item = product?.item || {};
    const parent = product?.parent || {};
    const parentItem = parent?.item || {};
    const description = item.product_description || parentItem.product_description || {};
    const enrichment = item.enrichment || parentItem.enrichment || {};
    const images = enrichment.images || {};
    const brand = item.primary_brand || parentItem.primary_brand || {};
    const rating = parent?.ratings_and_reviews?.statistics?.rating || product?.ratings_and_reviews?.statistics?.rating || {};
    const price = parent?.price || product?.price || {};
    const vendor = (item.product_vendors || parentItem.product_vendors || [])[0] || {};
    const bullets = description?.soft_bullets?.bullets || description?.bullet_descriptions;

    const record = {
        position,
        page: pageNo,
        search_keyword: keyword,
        response_id: metadata?.response_ids?.[0],
        sort_by: metadata?.sort_by,
        total_results: metadata?.total_results,
        tcin: product?.tcin,
        parent_tcin: parent?.tcin,
        title: description?.title,
        buy_url: enrichment?.buy_url,
        primary_image_url: images?.primary_image_url,
        alternate_image_urls: images?.alternate_image_urls,
        brand: brand?.name,
        relationship_type: item?.relationship_type,
        item_type: item?.product_classification?.item_type?.name,
        vendor_name: vendor?.vendor_name,
        department_id: item?.merchandise_classification?.department_id,
        class_id: item?.merchandise_classification?.class_id,
        is_marketplace: item?.fulfillment?.is_marketplace,
        formatted_current_price: price?.formatted_current_price,
        formatted_comparison_price: price?.formatted_comparison_price,
        rating_average: rating?.average,
        rating_count: rating?.count,
        bullets,
        scraped_at: new Date().toISOString(),
    };

    return cleanValue(record);
};

await Actor.init();

try {
    const input = (await Actor.getInput()) || {};
    const {
        startUrl,
        keyword: keywordInput,
        results_wanted = 20,
        max_pages = 10,
        sort_by = 'relevance',
        include_sponsored = true,
        proxyConfiguration,
    } = input;

    const extracted = parseStartUrl(startUrl);
    const keyword = trimToUndefined(keywordInput) || extracted.keyword;

    if (!keyword) {
        throw new Error('Missing required input: keyword (or provide a valid startUrl with searchTerm).');
    }

    const resultsWanted = toPositiveInt(results_wanted, 20);
    const maxPages = toPositiveInt(max_pages, 10);
    let pagePath = extracted.pagePath || buildPagePath(keyword, startUrl);
    const fallbackSearchPath = buildPagePath(keyword);
    let usedSearchPathFallback = false;
    const visitorId = extracted.visitorId || randomVisitorId();
    const pricingStoreId = String(extracted.pricingStoreId || DEFAULT_PRICING_STORE_ID);
    const referer = startUrl || `https://www.target.com/s?searchTerm=${encodeURIComponent(keyword)}`;

    const proxyConfig = proxyConfiguration
        ? await Actor.createProxyConfiguration(proxyConfiguration)
        : undefined;

    let offset = 0;
    let pageNo = 1;
    let saved = 0;
    const seenTcins = new Set();

    while (saved < resultsWanted && pageNo <= maxPages) {
        const batchSize = Math.min(PAGE_SIZE_LIMIT, resultsWanted - saved);
        const searchParams = {
            key: TARGET_API_KEY,
            channel: 'WEB',
            count: String(batchSize),
            default_purchasability_filter: 'true',
            include_sponsored: String(Boolean(include_sponsored)),
            keyword,
            offset: String(offset),
            page: pagePath,
            platform: 'desktop',
            pricing_store_id: pricingStoreId,
            sort_by: trimToUndefined(sort_by) || 'relevance',
            visitor_id: visitorId,
        };

        const proxyUrl = proxyConfig ? await proxyConfig.newUrl() : undefined;

        log.info(`Fetching page ${pageNo} (offset=${offset}, count=${batchSize})`);

        let parsed;
        try {
            const response = await gotScraping.get(TARGET_API_URL, {
                searchParams,
                proxyUrl,
                timeout: { request: 45000 },
                headers: {
                    accept: 'application/json',
                    'accept-language': 'en-US,en;q=0.9',
                    'user-agent': randomUserAgent(),
                    referer,
                },
            });
            parsed = JSON.parse(response.body);
        } catch (error) {
            log.error(`API request failed on page ${pageNo}: ${error.message}`);
            break;
        }

        if (Array.isArray(parsed?.errors) && parsed.errors.length) {
            log.error(`API returned error: ${parsed.errors[0]?.message || 'Unknown error'}`);
            break;
        }

        const products = parsed?.data?.search?.products || [];
        const metadata = parsed?.data?.search?.search_response?.metadata || {};

        if (!products.length) {
            if (!usedSearchPathFallback && pagePath !== fallbackSearchPath) {
                log.warning(`No products found for page path '${pagePath}'. Retrying with fallback path '${fallbackSearchPath}'.`);
                pagePath = fallbackSearchPath;
                usedSearchPathFallback = true;
                offset = 0;
                pageNo = 1;
                continue;
            }
            log.info('No more products found, stopping pagination.');
            break;
        }

        const records = [];
        for (const product of products) {
            if (saved + records.length >= resultsWanted) break;
            const tcin = product?.tcin;
            if (tcin && seenTcins.has(tcin)) continue;

            const mapped = mapProduct(product, keyword, metadata, pageNo, offset + records.length + 1);
            if (!mapped || Object.keys(mapped).length === 0) continue;

            if (tcin) seenTcins.add(tcin);
            records.push(mapped);
        }

        if (!records.length) {
            log.info('No new unique products found on this page, stopping.');
            break;
        }

        await Dataset.pushData(records);
        saved += records.length;

        const countFromMetadata = Number(metadata?.count);
        const nextOffsetDelta = Number.isFinite(countFromMetadata) && countFromMetadata > 0
            ? countFromMetadata
            : products.length;

        offset += nextOffsetDelta;
        pageNo += 1;

        const totalResults = Number(metadata?.total_results);
        if (Number.isFinite(totalResults) && totalResults > 0 && offset >= totalResults) {
            break;
        }
    }

    log.info(`Extraction complete. Saved ${saved} products.`);
} finally {
    await Actor.exit();
}
