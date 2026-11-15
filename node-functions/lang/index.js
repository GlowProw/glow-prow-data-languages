/**
 * 翻译文本 CDN 接口
 * 部署于 lang.glow-prow.top，提供 glow-prow-data-languages 翻译 JSON 资源
 * 支持通过环境变量与请求参数切换线上/线下源
 * by cabbagelol
 */

import fs from 'node:fs';
import path from 'node:path';

const ORIGIN_URL = 'https://lang.glow-prow.top';
const TEST_URL = 'http://localhost:8088';

// 支持的语言列表
const SUPPORTED_LOCALES = ['zh_CN', 'zh_TW', 'en_US'];

// 各语言下可访问的翻译分类文件
const CATEGORY_FILES = [
    'ships',
    'items',
    'items_ammunition',
    'commodities',
    'calendar',
    'materials',
    'factions',
    'modifications',
    'perks',
    'seasons',
    'locations',
    'ultimates',
    'ranks',
    'cosmetics',
    'events',
    'worldEvents',
    'empireSkills',
    'mapLocations',
    'sets',
    'regions',
    'territories',
    'npcs',
    'enemies',
    'treasureMaps',
    'zones',
    'masterys',
    'quest',
    'map'
];

function isDebug(env) {
    return (env?.NODE_ENV || 'production') === 'development';
}

function getOriginURL(request, env = {}) {
    if (request) {
        try {
            const url = new URL(request.url);
            const envParam = url.searchParams.get('env');
            if (envParam === 'local' || envParam === 'offline') {
                return env.TARGET_TEST_DOMAIN || TEST_URL;
            }
            if (envParam === 'online' || envParam === 'prod') {
                return env.TARGET_DOMAIN || ORIGIN_URL;
            }
        } catch (_) {}
    }
    if (isDebug(env)) {
        return env.TARGET_TEST_DOMAIN || TEST_URL;
    }
    return env.TARGET_DOMAIN || ORIGIN_URL;
}

function getCorsHeaders() {
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Accept-Language',
        'Access-Control-Max-Age': '86400',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Vary': 'Origin'
    };
}

function jsonResponse(data, status = 200, extra = {}) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'public, max-age=3600',
            ...getCorsHeaders(),
            ...extra
        }
    });
}

/**
 * 主请求处理函数
 * GET /lang?locale=zh_CN&category=ships[&key=someKey][&env=local|online]
 */
export async function onRequestGet({request, env = {}}) {
    if (request.method === 'OPTIONS') {
        return new Response(null, {status: 204, headers: getCorsHeaders()});
    }

    const url = new URL(request.url);
    const locale = url.searchParams.get('locale') || 'zh_CN';
    const category = url.searchParams.get('category');
    const key = url.searchParams.get('key');

    // 校验 locale
    if (!SUPPORTED_LOCALES.includes(locale)) {
        return jsonResponse({
            error: '不支持的语言',
            message: `locale "${locale}" 不在支持列表中`,
            supportedLocales: SUPPORTED_LOCALES
        }, 400);
    }

    // 如果没有 category，返回所有分类列表
    if (!category) {
        return jsonResponse({
            locale,
            categories: CATEGORY_FILES
        });
    }

    // 校验 category
    if (!CATEGORY_FILES.includes(category)) {
        return jsonResponse({
            error: '无效的翻译分类',
            message: `category "${category}" 未配置`,
            availableCategories: CATEGORY_FILES
        }, 400);
    }

    let data = null;

    // 优先读取本地静态目录（同仓库运行时直接从本地文件加载，免去网络开销）
    try {
        const localFilePath = path.resolve(process.cwd(), `src/data/${locale}/${category}.json`);
        if (fs.existsSync(localFilePath)) {
            data = JSON.parse(fs.readFileSync(localFilePath, 'utf-8'));
        }
    } catch (_) {
        data = null;
    }

    // 若本地未读到（例如边缘无状态环境），根据环境配置 fallback 到 HTTP fetch
    if (!data) {
        const originURL = getOriginURL(request, env);
        const fileUrl = `${originURL}/src/data/${locale}/${category}.json`;
        try {
            const response = await fetch(fileUrl);
            if (!response.ok) {
                return jsonResponse({
                    error: '翻译文件未找到',
                    locale,
                    category,
                    status: response.status
                }, 404);
            }
            data = await response.json();
        } catch (error) {
            return jsonResponse({
                error: '内部服务错误',
                message: error.message
            }, 500);
        }
    }

    // 如果指定了 key，只返回该 key 对应的翻译值
    if (key) {
        if (!(key in data)) {
            return jsonResponse({
                error: '翻译键不存在',
                locale,
                category,
                key
            }, 404);
        }
        return jsonResponse({locale, category, key, value: data[key]});
    }

    return jsonResponse({locale, category, data});
}

