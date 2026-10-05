import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Actor, log } from 'apify';
import { Dataset } from 'crawlee';
import { Impit } from 'impit';

const TARGET_API_KEY = '9f36aeafbe60771e321a7cc95a78140772ab3e96';
const CDUI_API_URL = 'https://cdui-orchestrations.target.com/cdui_orchestrations/v1/pages/slp';

const LISTING_BROWSER = 'chrome151';
const BROWSER_PROFILES = [
    'chrome151',
    'chrome142',
    'chrome136',
    'chrome131',
    'chrome125',
    'chrome',
    'firefox144',
    'ios18',
];

const PAGE_SIZE_LIMIT = 24;

const REQUEST_TIMEOUT_MS = 45000;
const MAX_FETCH_ATTEMPTS = 8;
const RETRY_BASE_DELAY_MS = 800;
const RETRY_MAX_DELAY_MS = 8000;
const IMPIT_CLIENT_CACHE_LIMIT = 96;

const API_DISCOVERY_FILENAME = 'API_DISCOVERY.md';

const DEFAULT_SEARCH_URL = 'https://www.target.com/s?searchTerm=coffee';
const DEFAULT_STORE_ID = '3991';
const DEFAULT_SCHEDULED_STORE_ID = '810';
const DEFAULT_ZIP = '61010';
const DEFAULT_STATE = 'IL';
const DEFAULT_COUNTRY = 'US';
const DEFAULT_LATITUDE = '42.3497';
const DEFAULT_LONGITUDE = '-89.9201';
const DEFAULT_TIMEZONE = 'America/Chicago';

const sleep = (ms) => new Promise((resolve) => {
    setTimeout(resolve, ms);
});

const toPositiveInt = (value, fallback) => {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 1) return fallback;
    return Math.floor(n);
};

const randomVisitorId = () => randomBytes(16).toString('hex').toUpperCase();

const randomToken = (bytes = 4) => randomBytes(bytes).toString('hex');

const withDiagnostics = (error, diagnostics = {}) => {
    const normalized = error instanceof Error ? error : new Error(String(error));
    Object.assign(normalized, diagnostics);
    return normalized;
};

const topLevelKeys = (body) => {
    if (typeof body !== 'string' || !body) return 'empty';
    try {
        const parsed = JSON.parse(body);
        if (parsed && typeof parsed === 'object') return Object.keys(parsed).slice(0, 12).join(',') || 'object';
        return typeof parsed;
    } catch {
        return `non-json(${body.replace(/\s+/g, ' ').slice(0, 80)})`;
    }
};

const parseRetryAfter = (response) => {
    const raw = response?.headers?.get?.('retry-after');
    if (!raw) return undefined;
    const seconds = Number(raw);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, RETRY_MAX_DELAY_MS);
    const when = Date.parse(raw);
    if (Number.isFinite(when)) return Math.max(0, Math.min(when - Date.now(), RETRY_MAX_DELAY_MS));
    return undefined;
};

const retryDelay = (attempt, retryAfter) => {
    if (typeof retryAfter === 'number') return retryAfter;
    const exponential = RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
    return Math.min(exponential, RETRY_MAX_DELAY_MS) + Math.floor(Math.random() * 400);
};

const pickBrowser = (attempt) => BROWSER_PROFILES[(attempt - 1) % BROWSER_PROFILES.length] || LISTING_BROWSER;

let apiDiscoveryGuidance;
const readApiDiscoveryGuidance = async () => {
    if (apiDiscoveryGuidance !== undefined) return apiDiscoveryGuidance;

    const location = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', API_DISCOVERY_FILENAME);
    try {
        const content = await readFile(location, 'utf8');
        const marker = '## Auto-Healing Guidance';
        const index = content.indexOf(marker);
        apiDiscoveryGuidance = (index >= 0 ? content.slice(index + marker.length) : content.slice(-1200)).trim();
    } catch (error) {
        log.debug(`Auto-healing: could not read ${API_DISCOVERY_FILENAME} (${error.message}).`);
        apiDiscoveryGuidance = '';
    }

    return apiDiscoveryGuidance;
};

const diagnoseRequestFailure = async (error, { label, proxyMode }) => {
    const detail = error?.status ? `HTTP ${error.status}` : error?.message || 'unknown error';
    const context = [
        error?.browser ? `browser=${error.browser}` : undefined,
        `transport=${proxyMode}`,
        error?.bodyKeys ? `body-keys=${error.bodyKeys}` : undefined,
    ].filter(Boolean).join(' ');

    log.error(`${label} failed after retries (${detail}; ${context}).`);

    const guidance = await readApiDiscoveryGuidance();
    if (guidance) {
        log.warning(`${API_DISCOVERY_FILENAME} auto-healing guidance:\n${guidance}`);
    }
};

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

const HTML_ENTITIES = {
    '&amp;': '&',
    '&#38;': '&',
    '&quot;': '"',
    '&#34;': '"',
    '&#39;': "'",
    '&apos;': "'",
    '&lt;': '<',
    '&gt;': '>',
    '&nbsp;': ' ',
};

const decodeHtml = (value) => {
    if (typeof value !== 'string' || !value.includes('&')) return value;
    return value.replace(/&#?[a-zA-Z0-9]+;/g, (match) => HTML_ENTITIES[match] ?? match);
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
        title: decodeHtml(description?.title),
        buy_url: enrichment?.buy_url,
        primary_image_url: imageInfo?.primary_image?.url || imageInfo?.primary_image_url,
        alternate_image_urls: getAlternateImageUrls(imageInfo),
        swatch_image_url: imageInfo?.swatch_image?.url,
        brand: decodeHtml(brand?.name),
        brand_url: brand?.canonical_url,
        relationship_type: item?.relationship_type,
        item_type: item?.product_classification?.item_type?.name,
        vendor_name: decodeHtml(vendor?.vendor_name),
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

const buildTargetHeaders = (referer) => ({
    accept: 'application/json',
    'accept-language': 'en-US,en;q=0.9',
    ...(referer ? { referer } : {}),
});

const createRequestContext = ({ startUrl, keyword, extracted }) => {
    const pagePath = extracted.pagePath || buildPagePath(keyword, startUrl);
    const startUrlMatchesKeyword = !extracted.keyword || extracted.keyword.toLowerCase() === keyword.toLowerCase();
    const referer = startUrl && (extracted.pagePath || startUrlMatchesKeyword)
        ? startUrl
        : `https://www.target.com/s?searchTerm=${encodeURIComponent(keyword)}`;

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
        timezone: DEFAULT_TIMEZONE,
        referer,
    };
};

const impitClients = new Map();

const getImpitClient = (browser, proxyUrl) => {
    const key = `${browser}|${proxyUrl || 'direct'}`;
    const cached = impitClients.get(key);
    if (cached) return cached;

    if (impitClients.size >= IMPIT_CLIENT_CACHE_LIMIT) {
        for (const client of impitClients.values()) {
            try {
                client?.close?.();
            } catch {
                // Ignore close errors; the client is being discarded anyway.
            }
        }
        impitClients.clear();
    }

    const client = new Impit({
        browser,
        proxyUrl,
        timeout: REQUEST_TIMEOUT_MS,
        followRedirects: true,
    });
    impitClients.set(key, client);
    return client;
};

const isRetryableStatus = (status) => status === 403 || status === 407 || status === 408 || status === 425 || status === 429 || status === 435 || status >= 500;

const requestJson = async ({ buildUrl, headers, proxySupplier, label, attempts = MAX_FETCH_ATTEMPTS }) => {
    let lastError;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        const browser = pickBrowser(attempt);
        let proxyUrl;

        if (proxySupplier) {
            try {
                proxyUrl = await proxySupplier();
            } catch (error) {
                log.debug(`${label}: proxy session unavailable on attempt ${attempt}/${attempts} (${error.message}); trying a direct request.`);
                proxyUrl = undefined;
            }
        }

        let response;
        try {
            const client = getImpitClient(browser, proxyUrl);
            response = await client.fetch(buildUrl(attempt), { headers });
        } catch (error) {
            lastError = withDiagnostics(error, { browser });
            log.debug(`${label}: request error on attempt ${attempt}/${attempts} (browser=${browser}): ${error.message}`);
            if (attempt < attempts) await sleep(retryDelay(attempt));
            continue;
        }

        let body = '';
        try {
            body = await response.text();
        } catch {
            // Treat an unreadable body as empty; status handling below decides recovery.
        }

        const { status } = response;

        if (status >= 200 && status < 300) {
            try {
                return { status, payload: JSON.parse(body) };
            } catch {
                lastError = withDiagnostics(new Error('Invalid JSON response'), { status, bodyKeys: topLevelKeys(body), browser });
                log.debug(`${label}: non-JSON body on attempt ${attempt}/${attempts} (browser=${browser}).`);
                if (attempt < attempts) await sleep(retryDelay(attempt));
                continue;
            }
        }

        const bodyKeys = topLevelKeys(body);

        if (!isRetryableStatus(status)) {
            log.warning(`${label}: non-retryable HTTP ${status} (body-keys=${bodyKeys}).`);
            throw withDiagnostics(new Error(`HTTP ${status}`), { status, bodyKeys, browser });
        }

        lastError = withDiagnostics(new Error(`HTTP ${status}`), { status, bodyKeys, browser });
        log.debug(`${label}: HTTP ${status} on attempt ${attempt}/${attempts} (browser=${browser}, proxy=${proxyUrl ? 'yes' : 'no'}, body-keys=${bodyKeys}); rotating fingerprint and exit IP.`);
        if (attempt < attempts) await sleep(retryDelay(attempt, parseRetryAfter(response)));
    }

    throw lastError || new Error('Request failed');
};

const parseCduiSearchResponse = (payload) => {
    const modules = Array.isArray(payload?.data_source_modules) ? payload.data_source_modules : [];

    let searchResponse;
    for (const module of modules) {
        const candidate = module?.module_data?.search_response;
        if (candidate && (candidate.products || candidate.search_response)) {
            searchResponse = candidate;
            break;
        }
    }

    return {
        products: searchResponse?.products || [],
        metadata: {
            ...(searchResponse?.search_response?.metadata || searchResponse?.metadata || {}),
            ...(trimToUndefined(payload?.redirect_url) ? { redirect_url: payload.redirect_url } : {}),
        },
    };
};

const buildCduiUrl = ({ context, offset, count, sortBy, includeSponsored }) => {
    const queryString = new URLSearchParams({ searchTerm: context.keyword }).toString();
    const params = new URLSearchParams({
        key: TARGET_API_KEY,
        platform: 'WEB',
        privacy_do_not_sell: 'false',
        targeted_advertising_opt_out: 'false',
        device_type: 'desktop',
        sapphire_channel: 'WEB',
        sapphire_page: context.pagePath,
        channel: 'WEB',
        page: context.pagePath,
        visitor_id: context.visitorId,
        latitude: context.latitude,
        longitude: context.longitude,
        scheduled_delivery_store_id: context.scheduledDeliveryStoreId,
        scheduled_delivery_zip_code: context.zip,
        state: context.state,
        store_id: context.pricingStoreId,
        zip: context.zip,
        has_pending_inputs: 'false',
        count: String(count),
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
        timezone: context.timezone,
    });

    return `${CDUI_API_URL}?${params}`;
};

const fetchCduiPage = async ({ context, offset, count, sortBy, includeSponsored, proxySupplier }) => {
    const { status, payload } = await requestJson({
        buildUrl: (attempt) => buildCduiUrl({
            context: attempt === 1 ? context : { ...context, visitorId: randomVisitorId() },
            offset,
            count,
            sortBy,
            includeSponsored,
        }),
        headers: buildTargetHeaders(context.referer),
        proxySupplier,
        label: `listing page offset ${offset}`,
    });

    if (!payload) {
        throw new Error(`listing endpoint returned HTTP ${status}`);
    }

    const parsed = parseCduiSearchResponse(payload);
    const reportedError = Array.isArray(payload?.errors) ? payload.errors[0]?.message : undefined;
    if (reportedError && !parsed.products.length) throw new Error(reportedError);

    return parsed;
};

const resolveProxyInput = (input) => {
    if (!input || typeof input !== 'object') return undefined;
    const hasCustomUrls = Array.isArray(input.proxyUrls) && input.proxyUrls.length > 0;
    if (input.useApifyProxy === false && !hasCustomUrls) return undefined;
    return input;
};

const describeProxy = (config) => {
    if (!config) return 'direct (no proxy)';
    if (Array.isArray(config.proxyUrls) && config.proxyUrls.length) return 'custom proxy URLs';
    const groups = Array.isArray(config.apifyProxyGroups) ? config.apifyProxyGroups.join('+') : 'default';
    return `apify ${groups} (${config.apifyProxyCountry || 'any country'})`;
};

await Actor.init();

let exitCode = 0;

try {
    const input = (await Actor.getInput()) || {};
    const {
        startUrl: startUrlInput,
        keyword: keywordValue,
        results_wanted: resultsWantedInput = 20,
        max_pages: maxPagesInput = 10,
        sort_by: sortByInput = 'relevance',
        include_sponsored: includeSponsoredInput = true,
        proxyConfiguration,
    } = input;

    const providedStartUrl = trimToUndefined(startUrlInput);
    const keywordInput = trimToUndefined(keywordValue);

    const startUrl = keywordInput ? undefined : providedStartUrl || DEFAULT_SEARCH_URL;
    const extracted = parseStartUrl(startUrl);
    const keyword = keywordInput || extracted.keyword;

    if (!keyword) {
        throw new Error('Missing required input: keyword (or provide a valid startUrl with searchTerm).');
    }

    if (!keywordInput && !providedStartUrl) {
        log.info('No search input was provided; using the configured default Target search URL.');
    }

    const resultsWanted = toPositiveInt(resultsWantedInput, 20);
    const maxPages = toPositiveInt(maxPagesInput, 10);
    const sortBy = trimToUndefined(extracted.sortBy) || trimToUndefined(sortByInput) || 'relevance';
    const includeSponsored = extracted.includeSponsored ?? parseBoolean(includeSponsoredInput, true);

    let requestedProxy = resolveProxyInput(proxyConfiguration);
    if (!requestedProxy && Actor.isAtHome()) {
        requestedProxy = { useApifyProxy: true, apifyProxyGroups: ['RESIDENTIAL'] };
    }

    let proxyConfig;
    if (requestedProxy) {
        try {
            proxyConfig = await Actor.createProxyConfiguration(requestedProxy);
        } catch (error) {
            log.warning(`Proxy configuration is unavailable (${error.message}); continuing without a proxy.`);
            proxyConfig = undefined;
        }
    }

    const proxyMode = describeProxy(proxyConfig ? requestedProxy : undefined);
    const proxySupplier = proxyConfig
        ? () => proxyConfig.newUrl(`s${randomToken(4)}`)
        : undefined;
    log.info(`Transport: ${proxyMode}.`);

    const context = createRequestContext({ startUrl, keyword, extracted });

    let offset = 0;
    let pageNo = 1;
    let saved = 0;
    let firstPageFailed = false;
    const seenTcins = new Set();

    while (saved < resultsWanted && pageNo <= maxPages) {
        const batchSize = Math.min(PAGE_SIZE_LIMIT, resultsWanted - saved);
        log.info(`Fetching page ${pageNo} (offset=${offset}, count=${batchSize})`);

        let products = [];
        let metadata = {};

        try {
            ({ products, metadata } = await fetchCduiPage({
                context,
                offset,
                count: batchSize,
                sortBy,
                includeSponsored,
                proxySupplier,
            }));
        } catch (error) {
            await diagnoseRequestFailure(error, { label: `Listing page ${pageNo}`, proxyMode });
            if (pageNo === 1) {
                log.error(`Stopping pagination: page ${pageNo} could not be fetched.`);
                firstPageFailed = true;
            } else {
                log.warning(`Finished early after a temporary block while paging; returning the ${saved} product${saved === 1 ? '' : 's'} collected so far.`);
            }
            break;
        }

        if (!products.length) {
            const redirectUrl = trimToUndefined(metadata?.redirect_url);
            if (redirectUrl) {
                log.warning(`Target redirected this search to ${redirectUrl} and returned no direct product results.`);
            } else {
                log.info('No more products available, stopping pagination.');
            }
            break;
        }

        const records = [];
        for (const product of products) {
            if (saved + records.length >= resultsWanted) break;

            const tcinKey = product?.tcin != null ? String(product.tcin) : undefined;
            if (tcinKey && seenTcins.has(tcinKey)) continue;

            try {
                const mapped = mapProduct(product, keyword, metadata, pageNo, offset + records.length + 1);
                if (!mapped || Object.keys(mapped).length === 0) continue;

                if (tcinKey) seenTcins.add(tcinKey);
                records.push(mapped);
            } catch (error) {
                log.warning(`Skipping product${tcinKey ? ` ${tcinKey}` : ''}: ${error.message}`);
            }
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

    if (saved > 0) {
        log.info(`Extraction complete. Saved ${saved} products.`);
    } else if (firstPageFailed) {
        log.error('No products were collected because the listing endpoint was unavailable.');
        exitCode = 1;
    } else {
        log.info('Extraction complete. No products matched this search.');
    }
} catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error(`Actor run failed: ${message}`);
    exitCode = 1;
} finally {
    await Actor.exit({ exitCode });
}
