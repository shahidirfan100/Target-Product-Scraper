import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { Actor, log } from 'apify';
import { Dataset } from 'crawlee';
import { gotScraping } from 'got-scraping';

const API_DISCOVERY_PATH = new URL('../API_DISCOVERY.md', import.meta.url);
const TARGET_API_KEY = '9f36aeafbe60771e321a7cc95a78140772ab3e96';
const CDUI_API_URL = 'https://cdui-orchestrations.target.com/cdui_orchestrations/v1/pages/slp';
const SAPPHIRE_RUNTIME_URL = 'https://sapphire-api.target.com/sapphire/runtime/api/v1/raw/www.target.com/s';
const LEGACY_REDSKY_URL = 'https://redsky.target.com/redsky_aggregations/v1/web/plp_search_v2';
const PAGE_SIZE_LIMIT = 24;
const DEFAULT_STORE_ID = '3991';
const DEFAULT_SCHEDULED_STORE_ID = '810';
const DEFAULT_ZIP = '61010';
const DEFAULT_STATE = 'PB';
const DEFAULT_COUNTRY = 'PK';
const DEFAULT_LATITUDE = '30.170';
const DEFAULT_LONGITUDE = '72.680';

const BROWSER_PROFILES = [
    {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',
        secChUa: '"Google Chrome";v="149", "Chromium";v="149", "Not)A;Brand";v="24"',
        secChUaMobile: '?0',
        secChUaPlatform: '"Windows"',
    },
    {
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',
        secChUa: '"Google Chrome";v="149", "Chromium";v="149", "Not)A;Brand";v="24"',
        secChUaMobile: '?0',
        secChUaPlatform: '"macOS"',
    },
];

const randomProfile = () => BROWSER_PROFILES[Math.floor(Math.random() * BROWSER_PROFILES.length)];

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

const isListingPath = (pathname) => /^\/(s|c|b|sp|pl)(\/|$)/.test(pathname);

const keywordFromPathname = (pathname) => {
    const segments = pathname.split('/').filter(Boolean);
    if (segments.length < 2) return undefined;

    if (segments[0] === 's') {
        return trimToUndefined(decodeURIComponent(segments[1]).replace(/\+/g, ' '));
    }

    if (['c', 'b', 'sp', 'pl'].includes(segments[0])) {
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
            const inferredKeyword = keywordFromPathname(parsed.pathname);
            if (isListingPath(parsed.pathname) && inferredKeyword) return parsed.pathname;
        } catch {
            // Ignore invalid URL and build from keyword.
        }
    }

    return `/s/${encodeURIComponent(keyword).replace(/%20/g, '+')}`;
};

const parseBoolean = (value, fallback) => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (normalized === 'true') return true;
        if (normalized === 'false') return false;
    }
    return fallback;
};

const parseStartUrl = (startUrl) => {
    if (!startUrl) return {};

    try {
        const parsed = new URL(startUrl);
        const keyword = trimToUndefined(parsed.searchParams.get('searchTerm'))
            || trimToUndefined(parsed.searchParams.get('keyword'))
            || keywordFromPathname(parsed.pathname);

        return {
            keyword,
            pagePath: isListingPath(parsed.pathname) && keywordFromPathname(parsed.pathname) ? parsed.pathname : undefined,
            visitorId: trimToUndefined(parsed.searchParams.get('visitor_id')),
            pricingStoreId: trimToUndefined(parsed.searchParams.get('pricing_store_id'))
                || trimToUndefined(parsed.searchParams.get('store_id')),
            scheduledDeliveryStoreId: trimToUndefined(parsed.searchParams.get('scheduled_delivery_store_id'))
                || trimToUndefined(parsed.searchParams.get('store_id')),
            zip: trimToUndefined(parsed.searchParams.get('zip'))
                || trimToUndefined(parsed.searchParams.get('scheduled_delivery_zip_code')),
            state: trimToUndefined(parsed.searchParams.get('state')),
            latitude: trimToUndefined(parsed.searchParams.get('latitude')),
            longitude: trimToUndefined(parsed.searchParams.get('longitude')),
            includeSponsored: parsed.searchParams.has('include_sponsored')
                ? parseBoolean(parsed.searchParams.get('include_sponsored'), true)
                : undefined,
            sortBy: trimToUndefined(parsed.searchParams.get('sort_by')),
        };
    } catch {
        return {};
    }
};

const cleanValue = (value) => {
    if (value === null || value === undefined) return undefined;

    if (Array.isArray(value)) {
        const cleaned = value
            .map(cleanValue)
            .filter((item) => item !== undefined)
            .filter((item) => !(Array.isArray(item) && item.length === 0))
            .filter((item) => !(typeof item === 'object' && item !== null && !Array.isArray(item) && Object.keys(item).length === 0));
        return cleaned.length ? cleaned : undefined;
    }

    if (typeof value === 'object') {
        const cleaned = Object.entries(value).reduce((acc, [key, val]) => {
            const normalized = cleanValue(val);
            if (normalized !== undefined) acc[key] = normalized;
            return acc;
        }, {});
        return Object.keys(cleaned).length ? cleaned : undefined;
    }

    if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed || undefined;
    }

    return value;
};

const getAlternateImageUrls = (imageInfo = {}) => {
    const alternateImages = imageInfo.alternate_images || imageInfo.alternate_image_urls || [];
    return alternateImages
        .map((image) => {
            if (typeof image === 'string') return image;
            return image?.url;
        })
        .filter(Boolean);
};

const normalizeBullets = (description = {}) => {
    const softBullets = description.soft_bullets?.bullets;
    if (Array.isArray(softBullets) && softBullets.length) return softBullets;

    const bulletDescriptions = description.bullet_descriptions;
    if (Array.isArray(bulletDescriptions) && bulletDescriptions.length) return bulletDescriptions;

    return undefined;
};

const mapProduct = (product, keyword, metadata, pageNo, position) => {
    const item = product?.item || {};
    const parent = product?.parent || {};
    const parentItem = parent?.item || {};
    const description = item.product_description || parentItem.product_description || {};
    const enrichment = item.enrichment || parentItem.enrichment || {};
    const imageInfo = enrichment.image_info || enrichment.images || parentItem.enrichment?.image_info || {};
    const brand = item.primary_brand || parentItem.primary_brand || {};
    const rating = parent?.ratings_and_reviews?.statistics?.rating || product?.ratings_and_reviews?.statistics?.rating || {};
    const price = product?.price || parent?.price || {};
    const fulfillment = product?.fulfillment || parent?.fulfillment || {};
    const vendor = (item.product_vendors || parentItem.product_vendors || [])[0] || {};
    const category = product?.category || {};
    const reviewSummary = product?.review_summarization || parent?.review_summarization || {};
    const freeShipping = product?.free_shipping || {};
    const promotions = product?.promotions || [];
    const ornaments = product?.ornaments || [];

    const record = {
        position,
        page: pageNo,
        search_keyword: keyword,
        response_id: metadata?.response_ids?.[0],
        sort_by: metadata?.sort_by,
        current_page: metadata?.current_page,
        total_pages: metadata?.total_pages,
        total_results: metadata?.total_results,
        result_offset: metadata?.offset,
        tcin: product?.tcin,
        original_tcin: product?.original_tcin,
        parent_tcin: parent?.tcin,
        title: description?.title,
        buy_url: enrichment?.buy_url,
        primary_image_url: imageInfo?.primary_image?.url || imageInfo?.primary_image_url,
        alternate_image_urls: getAlternateImageUrls(imageInfo),
        swatch_image_url: imageInfo?.swatch_image?.url,
        brand: brand?.name,
        brand_url: brand?.canonical_url,
        relationship_type: item?.relationship_type,
        item_type: item?.product_classification?.item_type?.name,
        vendor_name: vendor?.vendor_name,
        department_id: item?.merchandise_classification?.department_id,
        class_id: item?.merchandise_classification?.class_id,
        category_id: category?.category_id,
        parent_category_id: category?.parent_category_id,
        is_marketplace: item?.fulfillment?.is_marketplace,
        is_out_of_stock_all_locations: fulfillment?.is_out_of_stock_in_all_store_locations,
        sold_out: fulfillment?.sold_out,
        shipping_availability: fulfillment?.shipping_options?.availability_status,
        scheduled_delivery_availability: fulfillment?.scheduled_delivery?.availability_status,
        free_shipping_enabled: freeShipping?.enabled,
        formatted_current_price: price?.formatted_current_price,
        formatted_comparison_price: price?.formatted_comparison_price,
        current_retail: price?.current_retail,
        reg_retail: price?.reg_retail,
        rating_average: rating?.average,
        rating_count: rating?.count,
        review_overall_sentiment: reviewSummary?.overall_sentiment,
        review_highlighted_pros: reviewSummary?.highlighted_pros,
        bullets: normalizeBullets(description),
        promotions: promotions.map((promotion) => promotion?.promotion_id || promotion?.offer_id || promotion?.message).filter(Boolean),
        ornaments: ornaments.map((ornament) => ornament?.display || ornament?.long_description).filter(Boolean),
        scraped_at: new Date().toISOString(),
    };

    return cleanValue(record);
};

const buildBrowserHeaders = (referer) => {
    const profile = randomProfile();
    return {
        accept: 'application/json',
        'accept-language': 'en-US,en;q=0.9',
        referer,
        'sec-ch-ua': profile.secChUa,
        'sec-ch-ua-mobile': profile.secChUaMobile,
        'sec-ch-ua-platform': profile.secChUaPlatform,
        'user-agent': profile.userAgent,
    };
};

const createRequestContext = ({ startUrl, keyword, extracted }) => {
    const pagePath = extracted.pagePath || buildPagePath(keyword, startUrl);

    return {
        keyword,
        pagePath,
        visitorId: extracted.visitorId || randomVisitorId(),
        pricingStoreId: String(extracted.pricingStoreId || DEFAULT_STORE_ID),
        scheduledDeliveryStoreId: String(extracted.scheduledDeliveryStoreId || DEFAULT_SCHEDULED_STORE_ID),
        zip: String(extracted.zip || DEFAULT_ZIP),
        state: String(extracted.state || DEFAULT_STATE),
        country: DEFAULT_COUNTRY,
        latitude: String(extracted.latitude || DEFAULT_LATITUDE),
        longitude: String(extracted.longitude || DEFAULT_LONGITUDE),
        referer: startUrl || `https://www.target.com/s?searchTerm=${encodeURIComponent(keyword)}`,
    };
};

const extractDiscoverySummary = async () => {
    try {
        const contents = await readFile(API_DISCOVERY_PATH, 'utf8');
        const firstLines = contents
            .split(/\r?\n/)
            .filter(Boolean)
            .slice(0, 8)
            .join(' ');

        return firstLines || 'API discovery file is present but empty.';
    } catch (error) {
        return `API discovery file could not be read: ${error.message}`;
    }
};

const bootstrapSearchContext = async ({ context, proxyUrl }) => {
    const headers = buildBrowserHeaders(context.referer);
    const runtimeSearchParams = {
        searchTerm: context.keyword,
        channel: 'web',
        context: `geo,${context.zip}|${context.latitude}|${context.longitude}|${context.state}|${context.country}`,
        service: 'redoak,digital-web',
        source: 'top-of-funnel',
        state: context.state,
        tm: 'false',
        visitor_id: context.visitorId,
        zip: context.zip,
    };

    const response = await gotScraping.get(SAPPHIRE_RUNTIME_URL, {
        searchParams: runtimeSearchParams,
        proxyUrl,
        timeout: { request: 45000 },
        headers,
    });

    const runtimeData = JSON.parse(response.body);
    return {
        visitorId: runtimeData?.vid || context.visitorId,
        sapphirePage: runtimeData?.pages?.[0]?.id || context.pagePath,
        headers,
    };
};

const parseCduiSearchResponse = (payload) => {
    const searchModule = (payload?.data_source_modules || [])
        .find((module) => module?.module_type === 'SearchWebDataSource');

    const searchResponse = searchModule?.module_data?.search_response;
    return {
        products: searchResponse?.products || [],
        metadata: searchResponse?.search_response?.metadata || {},
    };
};

const parseLegacyRedskyResponse = (payload) => ({
    products: payload?.data?.search?.products || [],
    metadata: payload?.data?.search?.search_response?.metadata || {},
});

const fetchCduiPage = async ({
    context,
    sapphirePage,
    offset,
    batchSize,
    sortBy,
    includeSponsored,
    proxyUrl,
}) => {
    const queryString = new URLSearchParams({ searchTerm: context.keyword }).toString();
    const response = await gotScraping.get(CDUI_API_URL, {
        proxyUrl,
        timeout: { request: 45000 },
        headers: buildBrowserHeaders(context.referer),
        searchParams: {
            key: TARGET_API_KEY,
            platform: 'WEB',
            privacy_do_not_sell: 'false',
            targeted_advertising_opt_out: 'false',
            device_type: 'desktop',
            sapphire_channel: 'WEB',
            sapphire_page: sapphirePage,
            channel: 'WEB',
            page: sapphirePage,
            visitor_id: context.visitorId,
            latitude: context.latitude,
            longitude: context.longitude,
            scheduled_delivery_store_id: context.scheduledDeliveryStoreId,
            scheduled_delivery_zip_code: context.zip,
            state: context.state,
            store_id: context.pricingStoreId,
            zip: context.zip,
            has_pending_inputs: 'false',
            count: String(batchSize),
            default_purchasability_filter: 'false',
            include_sponsored: String(includeSponsored),
            new_search: String(offset === 0),
            offset: String(offset),
            spellcheck: 'true',
            keyword: context.keyword,
            sort_by: sortBy,
            is_seo_bot: 'false',
            include_data_source_modules: 'true',
            query_string: queryString,
            timezone: 'Asia/Karachi',
        },
        throwHttpErrors: false,
    });

    return {
        endpoint: 'cdui',
        statusCode: response.statusCode,
        payload: JSON.parse(response.body),
    };
};

const fetchLegacyRedskyPage = async ({
    context,
    offset,
    batchSize,
    sortBy,
    includeSponsored,
    proxyUrl,
}) => {
    const response = await gotScraping.get(LEGACY_REDSKY_URL, {
        proxyUrl,
        timeout: { request: 45000 },
        headers: buildBrowserHeaders(context.referer),
        searchParams: {
            key: TARGET_API_KEY,
            channel: 'WEB',
            count: String(batchSize),
            default_purchasability_filter: 'false',
            include_sponsored: String(includeSponsored),
            keyword: context.keyword,
            offset: String(offset),
            page: context.pagePath,
            platform: 'desktop',
            pricing_store_id: context.pricingStoreId,
            sort_by: sortBy,
            visitor_id: context.visitorId,
            zip: context.zip,
            scheduled_delivery_store_id: context.scheduledDeliveryStoreId,
            useragent: buildBrowserHeaders(context.referer)['user-agent'],
        },
        throwHttpErrors: false,
    });

    return {
        endpoint: 'legacy-redsky',
        statusCode: response.statusCode,
        payload: JSON.parse(response.body),
    };
};

const selectWorkingStrategy = async ({
    context,
    sapphirePage,
    offset,
    batchSize,
    sortBy,
    includeSponsored,
    proxyUrl,
}) => {
    const discoverySummary = await extractDiscoverySummary();
    log.warning(`Diagnosing Target API failure. API_DISCOVERY.md summary: ${discoverySummary}`);

    const probes = [
        () => fetchCduiPage({ context, sapphirePage, offset, batchSize, sortBy, includeSponsored, proxyUrl }),
        () => fetchLegacyRedskyPage({ context, offset, batchSize, sortBy, includeSponsored, proxyUrl }),
    ];

    for (const probe of probes) {
        try {
            const result = await probe();
            const parser = result.endpoint === 'cdui' ? parseCduiSearchResponse : parseLegacyRedskyResponse;
            const { products, metadata } = parser(result.payload);
            const reportedError = Array.isArray(result.payload?.errors) ? result.payload.errors[0]?.message : undefined;

            log.info(`Probe ${result.endpoint} returned status ${result.statusCode} with ${products.length} products.`);

            if (reportedError) {
                log.warning(`Probe ${result.endpoint} reported error: ${reportedError}`);
                continue;
            }

            if (result.statusCode >= 400 || products.length === 0) {
                const topLevelKeys = Object.keys(result.payload || {});
                log.warning(`Probe ${result.endpoint} was not usable. Top-level keys: ${topLevelKeys.join(', ') || 'none'}`);
                continue;
            }

            return {
                endpoint: result.endpoint,
                products,
                metadata,
            };
        } catch (error) {
            log.warning(`Probe failed: ${error.message}`);
        }
    }

    throw new Error('No working Target listing endpoint was available after runtime diagnosis.');
};

await Actor.init();

try {
    const input = (await Actor.getInput()) || {};
    const {
        startUrl,
        keyword: keywordInput,
        results_wanted: resultsWantedInput = 20,
        max_pages: maxPagesInput = 10,
        sort_by: sortByInput = 'relevance',
        include_sponsored: includeSponsoredInput = true,
        proxyConfiguration,
    } = input;

    const extracted = parseStartUrl(startUrl);
    const keyword = trimToUndefined(keywordInput) || extracted.keyword;

    if (!keyword) {
        throw new Error('Missing required input: keyword (or provide a valid startUrl with searchTerm).');
    }

    const resultsWanted = toPositiveInt(resultsWantedInput, 20);
    const maxPages = toPositiveInt(maxPagesInput, 10);
    const sortBy = trimToUndefined(extracted.sortBy) || trimToUndefined(sortByInput) || 'relevance';
    const includeSponsored = extracted.includeSponsored ?? parseBoolean(includeSponsoredInput, true);
    const proxyConfig = proxyConfiguration
        ? await Actor.createProxyConfiguration(proxyConfiguration)
        : undefined;

    const context = createRequestContext({ startUrl, keyword, extracted });
    const proxyUrl = proxyConfig ? await proxyConfig.newUrl() : undefined;
    const bootstrapped = await bootstrapSearchContext({ context, proxyUrl });

    context.visitorId = bootstrapped.visitorId;
    context.pagePath = bootstrapped.sapphirePage || context.pagePath;

    let offset = 0;
    let pageNo = 1;
    let saved = 0;
    let activeEndpoint = 'cdui';
    const seenTcins = new Set();

    while (saved < resultsWanted && pageNo <= maxPages) {
        const batchSize = Math.min(PAGE_SIZE_LIMIT, resultsWanted - saved);
        log.info(`Fetching page ${pageNo} (offset=${offset}, count=${batchSize}, endpoint=${activeEndpoint})`);

        let products = [];
        let metadata = {};

        try {
            if (activeEndpoint === 'cdui') {
                const result = await fetchCduiPage({
                    context,
                    sapphirePage: context.pagePath,
                    offset,
                    batchSize,
                    sortBy,
                    includeSponsored,
                    proxyUrl,
                });

                ({ products, metadata } = parseCduiSearchResponse(result.payload));
                if (result.statusCode >= 400 || products.length === 0) {
                    const errorMessage = Array.isArray(result.payload?.errors) ? result.payload.errors[0]?.message : undefined;
                    throw new Error(errorMessage || `Primary listing endpoint returned status ${result.statusCode}`);
                }
            } else {
                const result = await fetchLegacyRedskyPage({
                    context,
                    offset,
                    batchSize,
                    sortBy,
                    includeSponsored,
                    proxyUrl,
                });

                ({ products, metadata } = parseLegacyRedskyResponse(result.payload));
                if (result.statusCode >= 400 || products.length === 0) {
                    const errorMessage = Array.isArray(result.payload?.errors) ? result.payload.errors[0]?.message : undefined;
                    throw new Error(errorMessage || `Legacy listing endpoint returned status ${result.statusCode}`);
                }
            }
        } catch (error) {
            log.warning(`Page ${pageNo} failed on endpoint ${activeEndpoint}: ${error.message}`);
            const diagnosed = await selectWorkingStrategy({
                context,
                sapphirePage: context.pagePath,
                offset,
                batchSize,
                sortBy,
                includeSponsored,
                proxyUrl,
            });

            activeEndpoint = diagnosed.endpoint;
            products = diagnosed.products;
            metadata = diagnosed.metadata;
        }

        if (!products.length) {
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
            : batchSize;

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
