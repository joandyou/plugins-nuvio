/**
 * =============================================================================
 * Nuvio Provider: Phim VSMov (vsmov.com)
 * ID: vsmov
 * Author: jtmy
 * Version: 1.0.0
 * 
 * 🎯 NGUYÊN LÝ HOẠT ĐỘNG:
 * - 100% Client-Side / Zero Proxy: Toàn bộ quá trình diễn ra trực tiếp tại Client
 *   (Hermes JS Engine trên Nuvio Mobile, Android TV, iOS, Windows, macOS).
 * - Bóc tách luồng m3u8 HLS native trực tiếp từ link embed của VSMov
 *   (thay thế /video/ thành /stream/ + master.m3u8).
 * - Tự động trích xuất phụ đề WebVTT từ player để hiển thị native trên Nuvio.
 * - Hỗ trợ TMDB ID, IMDb ID và Meta title fallback qua Smart Matching Engine.
 * =============================================================================
 */

// -----------------------------------------------------------------------------
// 1. CONFIGURATION & CONSTANTS
// -----------------------------------------------------------------------------
var BASE_URL = "https://vsmov.com";
var BASE_API = "https://vsmov.com/api";
var DEFAULT_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
var TMDB_KEYS = [
    "fee0af381d9d9ec15ad158cf7f78c7f5",
    "e3b1be5bccccfda3542d7326f95e6887",
    "439c478a771f35c05022f9feabcca01c",
    "1865f43a0549ca50d341dd9ab8b29f49"
];

var CF_FALLBACK_PROXY = "https://j-proxy-fallback.khx.workers.dev/?url=";
var CODETABS_PROXY = "https://api.codetabs.com/v1/proxy?quest=";

var CACHE_TTL = 1000 * 60 * 10; // 10 phút
var memoryCache = {};

// -----------------------------------------------------------------------------
// 2. STRING & URL HELPERS (HERMES COMPATIBLE - NO WHATWG URL DEPENDENCY)
// -----------------------------------------------------------------------------
function cleanIdPrefix(idStr) {
    if (!idStr) return "";
    return String(idStr)
        .trim()
        .replace(/^(tmdb|imdb|jkkphim|vsmov|jnguonc|kkphim):/i, "")
        .replace(/^(jkkphim_|vsmov_|jnguonc_|kkphim_)/i, "");
}

function toSlug(str) {
    if (!str) return "";
    return String(str)
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[đĐ]/g, "d")
        .replace(/[^a-z0-9]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
}

function cleanKeyword(str) {
    if (!str) return "";
    return String(str)
        .replace(/[:\-–—_]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function normalizeStr(str) {
    if (!str) return "";
    return String(str)
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[đĐ]/g, "d")
        .replace(/[^a-z0-9]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

// -----------------------------------------------------------------------------
// 3. NETWORK HELPERS (DIRECT CLIENT REQUESTS WITH SAFE CACHE & PROXY FALLBACK)
// -----------------------------------------------------------------------------
function fetchJson(url) {
    var headers = {
        "User-Agent": DEFAULT_UA,
        "Accept": "application/json, text/plain, */*"
    };

    return fetch(url, { headers: headers })
        .then(function (res) {
            if (res.status === 404) return null;
            if (!res.ok) throw new Error("HTTP " + res.status);
            return res.json();
        })
        .catch(function () {
            // Tầng dự phòng 1: Cloudflare Worker Proxy
            var cfUrl = CF_FALLBACK_PROXY + encodeURIComponent(url);
            return fetch(cfUrl, { headers: headers })
                .then(function (cfRes) {
                    if (!cfRes.ok) throw new Error("CF HTTP " + cfRes.status);
                    return cfRes.json();
                })
                .catch(function () {
                    // Tầng dự phòng 2: Codetabs Proxy
                    var ctUrl = CODETABS_PROXY + encodeURIComponent(url);
                    return fetch(ctUrl, { headers: headers })
                        .then(function (ctRes) {
                            if (!ctRes.ok) throw new Error("Codetabs HTTP " + ctRes.status);
                            return ctRes.json();
                        })
                        .catch(function () {
                            return null;
                        });
                });
        });
}

function cachedFetchJson(url) {
    var now = Date.now();
    var cached = memoryCache[url];
    if (cached && (now - cached.time < CACHE_TTL)) {
        return Promise.resolve(cached.data);
    }

    return fetchJson(url).then(function (data) {
        if (data) {
            memoryCache[url] = { time: now, data: data };
        }
        return data;
    });
}

// -----------------------------------------------------------------------------
// 4. TMDB METADATA RESOLVER
// -----------------------------------------------------------------------------
function getTmdbInfo(rawId, mediaType) {
    var idStr = cleanIdPrefix(rawId);
    if (!idStr) return Promise.resolve(null);

    var isTv = mediaType === "tv" || mediaType === "series";
    var typeEndpoint = isTv ? "tv" : "movie";
    var apiKey = TMDB_KEYS[0];

    // Tra cứu qua IMDb ID (tt...)
    if (idStr.startsWith("tt")) {
        var findUrl = "https://api.themoviedb.org/3/find/" + idStr + "?api_key=" + apiKey + "&external_source=imdb_id";
        return cachedFetchJson(findUrl).then(function (data) {
            if (!data) return null;
            var res = isTv ? (data.tv_results || [])[0] : (data.movie_results || [])[0];
            if (!res) return null;

            var titleVi = res.title || res.name || "";
            var titleEn = res.original_title || res.original_name || titleVi;
            var relDate = res.release_date || res.first_air_date || "";
            var year = relDate ? relDate.substring(0, 4) : "";

            return {
                titleVi: titleVi,
                titleEn: titleEn,
                originalTitle: res.original_title || res.original_name || "",
                year: year,
                tmdbId: res.id ? String(res.id) : null,
                imdbId: idStr,
                aliases: []
            };
        });
    }

    // Tra cứu qua TMDB Numeric ID
    if (/^\d+$/.test(idStr)) {
        var urlVi = "https://api.themoviedb.org/3/" + typeEndpoint + "/" + idStr + "?api_key=" + apiKey + "&language=vi-VN&append_to_response=alternative_titles,external_ids";
        var urlEn = "https://api.themoviedb.org/3/" + typeEndpoint + "/" + idStr + "?api_key=" + apiKey + "&language=en-US&append_to_response=external_ids";

        return Promise.all([cachedFetchJson(urlVi), cachedFetchJson(urlEn)]).then(function (results) {
            var viData = results[0];
            var enData = results[1];

            if (!viData && !enData) return null;

            var titleVi = (viData && (viData.title || viData.name)) || "";
            var titleEn = (enData && (enData.title || enData.name)) || (viData && (viData.original_title || viData.original_name)) || "";
            var originalTitle = (viData && (viData.original_title || viData.original_name)) || (enData && (enData.original_title || enData.original_name)) || "";

            var dateStr = (viData && (viData.release_date || viData.first_air_date)) || (enData && (enData.release_date || enData.first_air_date)) || "";
            var year = dateStr ? dateStr.substring(0, 4) : "";

            var aliases = [];
            if (viData && viData.alternative_titles) {
                var altList = viData.alternative_titles.titles || viData.alternative_titles.results || [];
                altList.forEach(function (item) {
                    var t = item.title || item.name;
                    if (t && aliases.indexOf(t) === -1) aliases.push(t);
                });
            }

            var imdbId = (viData && viData.external_ids && viData.external_ids.imdb_id)
                      || (enData && enData.external_ids && enData.external_ids.imdb_id)
                      || (viData && viData.imdb_id)
                      || (enData && enData.imdb_id)
                      || null;

            return {
                titleVi: titleVi,
                titleEn: titleEn,
                originalTitle: originalTitle,
                year: year,
                aliases: aliases,
                tmdbId: idStr,
                imdbId: imdbId
            };
        });
    }

    return Promise.resolve(null);
}

// -----------------------------------------------------------------------------
// 5. VSMOV API CLIENT
// -----------------------------------------------------------------------------
function searchVSMov(keyword) {
    if (!keyword) return Promise.resolve([]);
    var url = BASE_API + "/tim-kiem?keyword=" + encodeURIComponent(keyword) + "&limit=20&page=1";
    return cachedFetchJson(url).then(function (res) {
        if (!res) return [];
        return res.items || (res.data && res.data.items) || [];
    }).catch(function () {
        return [];
    });
}

function fetchVSMovDetail(slug) {
    if (!slug) return Promise.resolve(null);
    var url = BASE_API + "/phim/" + slug;
    return cachedFetchJson(url).then(function (res) {
        if (res && (res.status === true || res.status === "success") && (res.movie || res.item)) {
            return res;
        }
        return null;
    }).catch(function () {
        return null;
    });
}

// -----------------------------------------------------------------------------
// 6. DIRECT STREAM & SUBTITLES EXTRACTOR (VSMOV EMBED HTML - ZERO PROXY)
// -----------------------------------------------------------------------------
function extractVsmovStream(embedUrl, existingM3u8) {
    if (existingM3u8 && String(existingM3u8).indexOf(".m3u8") >= 0) {
        return Promise.resolve({
            m3u8: existingM3u8,
            subtitle: "",
            subtitles: []
        });
    }
    if (!embedUrl) {
        return Promise.resolve({ m3u8: "", subtitle: "", subtitles: [] });
    }

    var cleanEmbedUrl = String(embedUrl).trim();
    if (cleanEmbedUrl.startsWith("http://")) {
        cleanEmbedUrl = cleanEmbedUrl.replace("http://", "https://");
    }

    // Nếu embedUrl đã là link m3u8 trực tiếp
    if (cleanEmbedUrl.toLowerCase().indexOf(".m3u8") >= 0) {
        return Promise.resolve({
            m3u8: cleanEmbedUrl,
            subtitle: "",
            subtitles: []
        });
    }

    var originMatch = cleanEmbedUrl.match(/^(https?:\/\/[^\/]+)/i);
    var origin = originMatch ? originMatch[1] : "https://vsmov.com";
    var hashMatch = cleanEmbedUrl.match(/\/video\/([a-zA-Z0-9_-]+)/i);

    // Dự phòng sẵn m3u8 và origin từ cấu trúc link embed: https://{host}/video/{hash}
    var fallbackM3u8 = "";
    var fallbackSub = "";
    if (hashMatch) {
        if (origin.indexOf("sv2") >= 0) {
            fallbackM3u8 = origin + "/video/" + hashMatch[1] + "/master-b2.m3u8";
            fallbackSub = origin + "/video/" + hashMatch[1] + "/subtitle.vtt";
        } else {
            fallbackM3u8 = origin + "/stream/" + hashMatch[1] + "/master.m3u8";
        }
    }

    var headers = {
        "User-Agent": DEFAULT_UA,
        "Referer": "https://vsmov.com/"
    };

    var timeoutPromise = new Promise(function (resolve) {
        setTimeout(function () { resolve(null); }, 5000);
    });

    var fetchPromise = fetch(cleanEmbedUrl, { headers: headers })
        .then(function (res) {
            if (!res || !res.ok) return null;
            return res.text();
        })
        .catch(function () {
            return null;
        });

    return Promise.race([fetchPromise, timeoutPromise]).then(function (html) {
        if (!html) {
            return {
                m3u8: fallbackM3u8,
                subtitle: fallbackSub,
                subtitles: fallbackSub ? [{
                    url: fallbackSub,
                    src: fallbackSub,
                    label: "Tiếng Việt",
                    lang: "vi",
                    srclang: "vi",
                    default: true
                }] : []
            };
        }

        // 1. 🎯 BÓC TÁCH M3U8 (ĐA PHƯƠNG THỨC - ZERO PROXY)
        var m3u8 = "";

        // Cách 1: Tìm biến url = `...` hoặc url: `...` (ArtPlayer / Modern JS)
        var varUrlMatch = html.match(/(?:const|let|var)?\s*url\s*[:=]\s*[`"']([^`"'\s]+\.m3u8[^`"'\s]*)[`"']/i);
        if (varUrlMatch && varUrlMatch[1]) {
            m3u8 = varUrlMatch[1].replace(/[\\`"']/g, "").trim();
        }

        // Cách 2: signedMasterUrl trong playerOptions (nếu có giá trị)
        if (!m3u8) {
            var signedMatch = html.match(/signedMasterUrl\s*:\s*[`"']([^`"']+\.m3u8[^`"']*)[`"']/i)
                || html.match(/signedMasterUrl\s*:\s*[`"'](https?:\/\/[^`"']+)[`"']/i);
            if (signedMatch && signedMatch[1] && signedMatch[1].trim() !== "") {
                m3u8 = signedMatch[1].replace(/[\\`"']/g, "").trim();
            }
        }

        // Cách 3: Link trực tiếp .m3u8 trong script/HTML
        if (!m3u8) {
            var m3u8Match = html.match(/https?:\/\/[^"'`\s<>]+\.m3u8[^"'`\s<>]*/i);
            if (m3u8Match) {
                m3u8 = m3u8Match[0].replace(/[\\`"']/g, "").trim();
            }
        }

        // Cách 4: baseUrl + videoHash trong script
        if (!m3u8) {
            var baseUrlMatch = html.match(/baseUrl\s*=\s*[`"']([^`"']+)[`"']/i);
            var videoHashMatch = html.match(/videoHash\s*=\s*[`"']([^`"']+)[`"']/i);
            if (baseUrlMatch && videoHashMatch) {
                var bUrl = baseUrlMatch[1].replace(/\/+$/, "");
                if (bUrl.startsWith("http://")) bUrl = bUrl.replace("http://", "https://");
                m3u8 = bUrl + "/stream/" + videoHashMatch[1] + "/master.m3u8";
            }
        }

        // Cách 5: Fallback từ hash & origin
        if (!m3u8) {
            m3u8 = fallbackM3u8;
        }

        // Chuẩn hóa đường dẫn m3u8
        if (m3u8) {
            if (m3u8.startsWith("//")) {
                m3u8 = "https:" + m3u8;
            } else if (m3u8.startsWith("/")) {
                m3u8 = origin.replace(/\/+$/, "") + m3u8;
            } else if (m3u8.startsWith("http://")) {
                m3u8 = m3u8.replace("http://", "https://");
            }
        }

        // 2. 🎯 BÓC TÁCH PHỤ ĐỀ (SUBTITLES)
        var subtitles = [];

        // Cách 1: Parse mảng playerOptions.subtitles
        var subArrayMatch = html.match(/subtitles\s*:\s*(\[[\s\S]*?\])\s*,\s*(?:audios|thumb|linkVast|[a-zA-Z0-9_$]+\s*:)/i);
        if (subArrayMatch) {
            try {
                var items = JSON.parse(subArrayMatch[1]);
                if (Array.isArray(items)) {
                    items.forEach(function (item) {
                        if (!item || !item.url) return;
                        var fullSubUrl = item.url.startsWith("http")
                            ? item.url
                            : (origin.replace(/\/+$/, "") + "/" + item.url.replace(/^\/+/, ""));
                        if (fullSubUrl.startsWith("http://")) fullSubUrl = fullSubUrl.replace("http://", "https://");

                        var code = String(item.code || "").toLowerCase();
                        var label = "Tiếng Việt";
                        var srclang = "vi";
                        var isDefault = false;

                        if (code === "vie" || code === "vi") {
                            label = "Tiếng Việt";
                            srclang = "vi";
                            isDefault = true;
                        } else if (code === "eng" || code === "en") {
                            label = "Tiếng Anh";
                            srclang = "en";
                        } else if (code === "kor" || code === "ko") {
                            label = "Tiếng Hàn";
                            srclang = "ko";
                        } else if (code === "chi" || code === "zho" || code === "zh") {
                            label = "Tiếng Trung";
                            srclang = "zh";
                        } else if (code === "jpn" || code === "ja") {
                            label = "Tiếng Nhật";
                            srclang = "ja";
                        } else if (code === "tha" || code === "th") {
                            label = "Tiếng Thái";
                            srclang = "th";
                        } else {
                            label = item.name || code.toUpperCase() || "Phụ đề";
                            srclang = code.slice(0, 2) || "vi";
                        }

                        subtitles.push({
                            url: fullSubUrl.replace(/[\\`"']/g, "").trim(),
                            src: fullSubUrl.replace(/[\\`"']/g, "").trim(),
                            label: label,
                            lang: srclang,
                            srclang: srclang,
                            default: isDefault
                        });
                    });
                }
            } catch (e) {}
        }

        // Cách 2: Tìm biến subtitleUrl / subUrl = `...` (ArtPlayer style)
        if (subtitles.length === 0) {
            var subVarMatch = html.match(/(?:const|let|var)?\s*(?:subtitleUrl|subUrl)\s*[:=]\s*[`"']([^`"'\s]+\.(?:vtt|srt|json)[^`"'\s]*)[`"']/i);
            if (subVarMatch && subVarMatch[1]) {
                var rawUrl = subVarMatch[1].replace(/[\\`"']/g, "").trim();
                var fullSubUrl = rawUrl.startsWith("http")
                    ? rawUrl
                    : (origin.replace(/\/+$/, "") + "/" + rawUrl.replace(/^\/+/, ""));
                if (fullSubUrl.startsWith("http://")) fullSubUrl = fullSubUrl.replace("http://", "https://");
                subtitles.push({
                    url: fullSubUrl,
                    src: fullSubUrl,
                    label: "Tiếng Việt",
                    lang: "vi",
                    srclang: "vi",
                    default: true
                });
            }
        }

        // Cách 3: Regex fallback cho các trường url: "..."
        if (subtitles.length === 0) {
            var itemMatches = html.match(/["']?url["']?\s*:\s*[`"']([^`"']+\.(?:vtt|srt|json)[^`"']*)[`"']/gi);
            if (itemMatches) {
                itemMatches.forEach(function (mStr) {
                    var uMatch = mStr.match(/[`"']([^`"']+\.(?:vtt|srt|json)[^`"']*)[`"']/);
                    if (uMatch && uMatch[1]) {
                        var rawUrl = uMatch[1].replace(/[\\`"']/g, "").trim();
                        var fullSubUrl = rawUrl.startsWith("http")
                            ? rawUrl
                            : (origin.replace(/\/+$/, "") + "/" + rawUrl.replace(/^\/+/, ""));
                        if (fullSubUrl.startsWith("http://")) fullSubUrl = fullSubUrl.replace("http://", "https://");
                        var isVi = fullSubUrl.indexOf("vie") >= 0 || fullSubUrl.indexOf("vi.") >= 0 || fullSubUrl.indexOf("subtitle.vtt") >= 0;
                        subtitles.push({
                            url: fullSubUrl,
                            src: fullSubUrl,
                            label: isVi ? "Tiếng Việt" : "Phụ đề",
                            lang: isVi ? "vi" : "vi",
                            srclang: isVi ? "vi" : "vi",
                            default: isVi
                        });
                    }
                });
            }
        }

        // Cách 4: Link phụ đề đơn lẻ (.vtt, .srt, .json)
        if (subtitles.length === 0) {
            var subMatch = html.match(/https?:\/\/[^"'`\s<>]+\.(?:vtt|srt|json)[^"'`\s<>]*/i)
                || html.match(/[`"'](https?:\/\/[^"'`\s<>]+\.(?:vtt|json))[`"']/i)
                || html.match(/[`"'](\/video\/[^"'`\s<>]+\/subtitle\/[^"'`\s<>]+\.vtt)[`"']/i);
            if (subMatch) {
                var rawUrl = (subMatch[1] || subMatch[0]).replace(/[\\`"']/g, "").trim();
                var fullSubUrl = rawUrl.startsWith("http")
                    ? rawUrl
                    : (origin.replace(/\/+$/, "") + "/" + rawUrl.replace(/^\/+/, ""));
                if (fullSubUrl.startsWith("http://")) fullSubUrl = fullSubUrl.replace("http://", "https://");
                subtitles.push({
                    url: fullSubUrl,
                    src: fullSubUrl,
                    label: "Tiếng Việt",
                    lang: "vi",
                    srclang: "vi",
                    default: true
                });
            }
        }

        // Cách 5: Fallback sv2 subtitle nếu có
        if (subtitles.length === 0 && fallbackSub) {
            subtitles.push({
                url: fallbackSub,
                src: fallbackSub,
                label: "Tiếng Việt",
                lang: "vi",
                srclang: "vi",
                default: true
            });
        }

        if (subtitles.length > 0 && !subtitles.some(function (s) { return s.default; })) {
            subtitles[0].default = true;
        }

        var primarySub = (subtitles.find(function (s) { return s.default; }) || subtitles[0] || {}).url || "";

        return {
            m3u8: m3u8,
            subtitle: primarySub,
            subtitles: subtitles
        };
    }).catch(function () {
        return {
            m3u8: fallbackM3u8,
            subtitle: fallbackSub,
            subtitles: fallbackSub ? [{
                url: fallbackSub,
                src: fallbackSub,
                label: "Tiếng Việt",
                lang: "vi",
                srclang: "vi",
                default: true
            }] : []
        };
    });
}

function extractSubtitles(embedUrl) {
    return extractVsmovStream(embedUrl).then(function (res) {
        return res ? res.subtitles : [];
    });
}

// -----------------------------------------------------------------------------
// 7. SMART MATCHING ALGORITHM
// -----------------------------------------------------------------------------
function calculateMatchScore(candidate, searchQueries, targetYear, isTv, targetSeason) {
    var candName = normalizeStr(candidate.name || "");
    var candOrig = normalizeStr(candidate.origin_name || "");
    var candSlug = normalizeStr(String(candidate.slug || "").replace(/-/g, " "));

    var bestTextScore = 0;

    searchQueries.forEach(function (q) {
        var normQ = normalizeStr(q);
        if (!normQ) return;

        // 1. Trùng khớp hoàn toàn (+100 điểm)
        if (candName === normQ || candOrig === normQ || candSlug === normQ) {
            bestTextScore = Math.max(bestTextScore, 100);
            return;
        }

        // 2. Chứa trọn vẹn chuỗi tìm kiếm (+70 điểm)
        if (candName.indexOf(normQ) >= 0 || candOrig.indexOf(normQ) >= 0 || candSlug.indexOf(normQ) >= 0) {
            bestTextScore = Math.max(bestTextScore, 70);
            return;
        }

        if (normQ.indexOf(candName) >= 0 || normQ.indexOf(candOrig) >= 0) {
            bestTextScore = Math.max(bestTextScore, 50);
            return;
        }

        // 3. Khớp từng từ (Token Overlap)
        var qTokens = normQ.split(" ").filter(function (w) { return w.length > 1; });
        if (qTokens.length > 0) {
            var candTokens = (candName + " " + candOrig + " " + candSlug).split(" ");
            var matches = 0;
            qTokens.forEach(function (t) {
                if (candTokens.indexOf(t) >= 0) matches++;
            });
            var tokenScore = Math.round((matches / qTokens.length) * 45);
            bestTextScore = Math.max(bestTextScore, tokenScore);
        }
    });

    var totalScore = bestTextScore;

    // 4. Chấm điểm Năm phát hành (Year Tolerance & Remake Penalty)
    if (targetYear) {
        var tYear = parseInt(targetYear, 10);
        var yStr = candidate.year || (candidate.created && candidate.created.time ? candidate.created.time.substring(0, 4) : "");
        var cYear = parseInt(yStr, 10);
        if (cYear && tYear) {
            if (cYear === tYear) {
                totalScore += 30; // Trùng năm chính xác
            } else if (Math.abs(cYear - tYear) === 1) {
                totalScore += 15; // Lệch 1 năm
            } else {
                totalScore -= 40; // Trừ điểm nếu lệch nhiều năm
            }
        }
    }

    // 5. Chấm điểm Season cho Phim bộ
    if (isTv) {
        var seasonText = (candidate.slug + " " + (candidate.name || "") + " " + (candidate.origin_name || "")).toLowerCase();
        var seasonPatterns = [
            new RegExp("phan[- ]" + targetSeason + "\\b", "i"),
            new RegExp("season[- ]" + targetSeason + "\\b", "i"),
            new RegExp("ss[- ]*0?" + targetSeason + "\\b", "i"),
            new RegExp("p[- ]*0?" + targetSeason + "\\b", "i"),
            new RegExp("[-_]p" + targetSeason + "(?:[-_]|$)", "i"),
            new RegExp("phần " + targetSeason + "\\b", "i")
        ];
        var isSeasonMatch = seasonPatterns.some(function (p) { return p.test(seasonText); });
        if (isSeasonMatch) {
            totalScore += 40; // Đúng mùa
        } else if (targetSeason === 1 && !/phan[- ]\d|phần \d|season[- ]\d|[-_]p\d/i.test(seasonText)) {
            totalScore += 20; // Mùa 1 thường không ghi số phần
        } else {
            totalScore -= 50; // Khác mùa
        }
    }

    return totalScore;
}

function findBestSlug(searchQueries, targetYear, mediaType, season, targetTmdbId, targetImdbId) {
    var isTv = mediaType === "tv" || mediaType === "series";
    var targetSeason = season ? parseInt(season, 10) : 1;

    var uniqueQueries = [];
    searchQueries.forEach(function (q) {
        var cleaned = cleanKeyword(q);
        if (cleaned && uniqueQueries.indexOf(cleaned) === -1) {
            uniqueQueries.push(cleaned);
        }
        // Thêm biến thể Season nếu là phim bộ
        if (isTv && cleaned) {
            var sQueryVi = cleaned + " Phần " + targetSeason;
            if (uniqueQueries.indexOf(sQueryVi) === -1) uniqueQueries.push(sQueryVi);
            var sQueryEn = cleaned + " Season " + targetSeason;
            if (uniqueQueries.indexOf(sQueryEn) === -1) uniqueQueries.push(sQueryEn);
        }
        // Tách subtitle nếu có dấu : hoặc -
        if (cleaned && (cleaned.indexOf(":") >= 0 || cleaned.indexOf("-") >= 0)) {
            var parts = cleaned.split(/[:\-]/);
            parts.forEach(function (p) {
                var pClean = cleanKeyword(p);
                if (pClean && pClean.length > 3 && uniqueQueries.indexOf(pClean) === -1) {
                    uniqueQueries.push(pClean);
                }
            });
        }
    });

    if (uniqueQueries.length === 0) return Promise.resolve(null);

    function tryNextQuery(index) {
        if (index >= uniqueQueries.length) {
            return Promise.resolve(null);
        }

        var currentQuery = uniqueQueries[index];
        return searchVSMov(currentQuery).then(function (items) {
            if (!items || items.length === 0) {
                return tryNextQuery(index + 1);
            }

            // BƯỚC 1: Ưu tiên tuyệt đối nếu VSMov có sẵn ID TMDB hoặc IMDb
            if (targetTmdbId || targetImdbId) {
                var exactIdMatches = items.filter(function (it) {
                    if (targetTmdbId && it.tmdb && it.tmdb.id && String(it.tmdb.id) === String(targetTmdbId)) {
                        return true;
                    }
                    if (targetImdbId && it.imdb && it.imdb.id && String(it.imdb.id) === String(targetImdbId)) {
                        return true;
                    }
                    return false;
                });

                if (exactIdMatches.length > 0) {
                    // Nếu là phim bộ, chọn mùa chính xác trong các items trùng ID TMDB
                    if (isTv) {
                        var exactSeasonMatch = exactIdMatches.find(function (it) {
                            var seasonText = (it.slug + " " + (it.name || "") + " " + (it.origin_name || "")).toLowerCase();
                            var seasonPatterns = [
                                new RegExp("phan[- ]" + targetSeason + "\\b", "i"),
                                new RegExp("season[- ]" + targetSeason + "\\b", "i"),
                                new RegExp("ss[- ]*0?" + targetSeason + "\\b", "i"),
                                new RegExp("p[- ]*0?" + targetSeason + "\\b", "i"),
                                new RegExp("[-_]p" + targetSeason + "(?:[-_]|$)", "i"),
                                new RegExp("phần " + targetSeason + "\\b", "i")
                            ];
                            return seasonPatterns.some(function (p) { return p.test(seasonText); });
                        });

                        if (exactSeasonMatch) {
                            console.log("[VSMov] 🎯 Khớp chính xác 100% bằng ID (TMDB/IMDb) & Mùa: " + exactSeasonMatch.slug);
                            return Promise.resolve(exactSeasonMatch.slug);
                        }

                        if (targetSeason === 1 && exactIdMatches.length === 1) {
                            return Promise.resolve(exactIdMatches[0].slug);
                        }
                    } else {
                        console.log("[VSMov] 🎯 Khớp chính xác 100% bằng ID (TMDB/IMDb): " + exactIdMatches[0].slug);
                        return Promise.resolve(exactIdMatches[0].slug);
                    }
                }
            }

            // BƯỚC 2: Lọc sơ bộ theo loại hình Phim lẻ vs Phim bộ
            var candidates = items.filter(function (it) {
                var totalEps = parseInt(it.total_episodes || it.episode_total || "1", 10);
                var curEp = String(it.current_episode || it.episode_current || "").toLowerCase();
                var rawType = String(it.type || "").toLowerCase();
                var itIsSeries = rawType.includes("series") || rawType.includes("tvshows") || totalEps > 2 || curEp.includes("tập") || curEp.includes("tap") || it.slug.includes("phan-") || it.slug.includes("-p");

                if (!isTv && itIsSeries && totalEps > 2) {
                    return false;
                }
                return true;
            });

            if (candidates.length === 0) candidates = items;

            // BƯỚC 3: Chấm điểm trọng số độ tương đồng
            var scoredCandidates = candidates.map(function (it) {
                return {
                    slug: it.slug,
                    name: it.name,
                    score: calculateMatchScore(it, searchQueries, targetYear, isTv, targetSeason)
                };
            });

            scoredCandidates.sort(function (a, b) {
                return b.score - a.score;
            });

            var best = scoredCandidates[0];
            if (best && best.score > 25) {
                console.log("[VSMov] 🏆 Khớp phim có điểm cao nhất: " + best.slug + " (Điểm: " + best.score + ")");
                return Promise.resolve(best.slug);
            }

            return tryNextQuery(index + 1);
        });
    }

    return tryNextQuery(0);
}

// -----------------------------------------------------------------------------
// 8. STREAM EXTRACTION (DIRECT M3U8 FROM VSMOV PLAYER)
// -----------------------------------------------------------------------------
function extractStreamsFromVSMovData(data, mediaType, season, episode, preferredServer) {
    if (!data) return Promise.resolve([]);

    var movie = data.movie || data.item || (data.data && data.data.item) || {};
    var episodes = data.episodes || (data.movie && data.movie.episodes) || (data.data && data.data.item && data.data.item.episodes) || [];

    var movieTitle = movie.name || movie.origin_name || "Phim";
    var movieQuality = movie.quality || "HD";

    var isTv = mediaType === "tv" || mediaType === "series" || (season !== null && season !== undefined && parseInt(season, 10) > 0);
    var targetEpNum = episode ? parseInt(episode, 10) : 1;

    var serverTasks = [];

    episodes.forEach(function (server) {
        var rawServerName = server.server_name || "Server";
        var cleanServerName = String(rawServerName)
            .replace(/\r?\n|\r/g, " ")
            .replace(/Server:\s*/gi, "")
            .trim()
            .replace(/\s+/g, " ") || "VIP";

        var items = server.server_data || server.items || [];
        if (!items || items.length === 0) return;

        var targetEp = null;
        if (isTv && episode !== null && episode !== undefined) {
            targetEp = items.find(function (e) {
                var nameStr = String(e.name || "").trim().toLowerCase();
                var slugStr = String(e.slug || "").trim().toLowerCase();

                if (nameStr === String(targetEpNum) || slugStr === String(targetEpNum) || slugStr === "tap-" + targetEpNum) {
                    return true;
                }

                var numMatch = nameStr.match(/\d+/);
                if (numMatch && parseInt(numMatch[0], 10) === targetEpNum) {
                    return true;
                }

                var slugNumMatch = slugStr.match(/(?:tap-)?(\d+)/);
                if (slugNumMatch && parseInt(slugNumMatch[1], 10) === targetEpNum) {
                    return true;
                }

                if (targetEpNum === 1 && (nameStr.indexOf("full") >= 0 || slugStr.indexOf("full") >= 0)) {
                    return true;
                }

                return false;
            });

            if (!targetEp && items.length === 1 && targetEpNum === 1) {
                targetEp = items[0];
            }
        } else {
            targetEp = items.find(function (e) {
                var nameStr = String(e.name || "").toLowerCase();
                var slugStr = String(e.slug || "").toLowerCase();
                return nameStr.indexOf("full") >= 0 || slugStr === "full" || slugStr === "tap-full";
            }) || items[0];
        }

        if (!targetEp) return;

        var epName = targetEp.name || (isTv ? "Tập " + targetEpNum : "Full");
        var rawEmbed = targetEp.link_embed || targetEp.embed || "";
        var rawM3u8 = targetEp.link_m3u8 || targetEp.m3u8 || targetEp.file || "";

        // Bóc tách luồng trực tiếp từ embed/m3u8
        var task = extractVsmovStream(rawEmbed, rawM3u8).then(function (extracted) {
            if (extracted && extracted.m3u8) {
                return {
                    name: "VSMov [" + cleanServerName + "] " + movieTitle + " - " + epName,
                    title: movieTitle + " - " + epName + " (" + movieQuality + ")",
                    url: extracted.m3u8,
                    quality: movieQuality,
                    type: "hls",
                    headers: {
                        "User-Agent": DEFAULT_UA,
                        "Referer": "https://vsmov.com/"
                    },
                    subtitles: extracted.subtitles || [],
                    provider: "vsmov"
                };
            }
            return null;
        });

        serverTasks.push(task);
    });

    return Promise.all(serverTasks).then(function (results) {
        var streams = [];
        var seenUrls = {};

        results.forEach(function (s) {
            if (s && s.url && !seenUrls[s.url]) {
                seenUrls[s.url] = true;
                streams.push(s);
            }
        });

        // Lọc theo cấu hình Server ưu tiên
        if (preferredServer === "vietsub") {
            var filteredVs = streams.filter(function (s) { return /vietsub/i.test(s.name); });
            if (filteredVs.length > 0) streams = filteredVs;
        } else if (preferredServer === "thuyetminh") {
            var filteredTm = streams.filter(function (s) { return /thuyết minh|thuyet minh/i.test(s.name); });
            if (filteredTm.length > 0) streams = filteredTm;
        }

        return streams;
    });
}

// -----------------------------------------------------------------------------
// 9. MAIN getStreams (EXPORTED TO NUVIO SCRAPERS ENGINE)
// -----------------------------------------------------------------------------
function getStreams(tmdbId, mediaType, season, episode, meta) {
    console.log("[VSMov] 🔍 Tra cứu luồng: ID=" + tmdbId + ", type=" + mediaType + ", S=" + season + ", E=" + episode);

    var cleanId = cleanIdPrefix(tmdbId);
    var isTv = mediaType === "tv" || mediaType === "series" || (season !== null && season !== undefined && parseInt(season, 10) > 0);
    var targetSeason = season ? parseInt(season, 10) : 1;

    var settings = {};
    try {
        if (typeof globalThis !== "undefined" && globalThis.SCRAPER_SETTINGS) {
            settings = globalThis.SCRAPER_SETTINGS;
        } else if (typeof global !== "undefined" && global.SCRAPER_SETTINGS) {
            settings = global.SCRAPER_SETTINGS;
        }
    } catch (e) {}
    var preferredServer = settings.preferredServer || "all";

    // -------------------------------------------------------------------------
    // BƯỚC 1: TRÍCH XUẤT TÊN PHIM VÀ NĂM TỪ META / ID (KHÔNG CẦN GỌI TMDB)
    // -------------------------------------------------------------------------
    var initialQueries = [];
    if (meta) {
        var possibleKeys = ["title", "name", "original_title", "origin_name", "titleVi", "titleEn"];
        possibleKeys.forEach(function (k) {
            if (meta[k] && typeof meta[k] === "string") {
                var val = meta[k].trim();
                if (val && initialQueries.indexOf(val) === -1) {
                    initialQueries.push(val);
                }
            }
        });
    }

    if (cleanId && !/^\d+$/.test(cleanId) && !cleanId.startsWith("tt")) {
        var fromSlug = cleanId.replace(/[-_]/g, " ").trim();
        if (fromSlug && initialQueries.indexOf(fromSlug) === -1) {
            initialQueries.push(fromSlug);
        }
    }

    var targetYear = (meta && meta.year) ? String(meta.year) : "";
    if (!targetYear && meta && meta.release_date) {
        targetYear = String(meta.release_date).substring(0, 4);
    }

    var targetTmdbId = /^\d+$/.test(cleanId) ? cleanId : (meta && meta.tmdb_id ? String(meta.tmdb_id) : null);
    var targetImdbId = cleanId.startsWith("tt") ? cleanId : (meta && meta.imdb_id ? String(meta.imdb_id) : null);

    // 🎯 KIỂM TRA SLUG TRỰC TIẾP (Nếu cleanId là dạng slug)
    var directSlugPromise = Promise.resolve(null);
    if (cleanId && !/^\d+$/.test(cleanId) && !cleanId.startsWith("tt") && cleanId.indexOf("-") >= 0) {
        var directSlug = toSlug(cleanId);
        directSlugPromise = fetchVSMovDetail(directSlug).then(function (detailRes) {
            if (detailRes && (detailRes.movie || detailRes.item)) {
                console.log("[VSMov] ✅ Khớp slug trực tiếp: " + directSlug);
                return extractStreamsFromVSMovData(detailRes, mediaType, season, episode, preferredServer);
            }
            return null;
        });
    }

    return directSlugPromise.then(function (foundDirectStreams) {
        if (foundDirectStreams && foundDirectStreams.length > 0) {
            return foundDirectStreams;
        }

        // ⚡ BƯỚC 2 (ƯU TIÊN HÀNG ĐẦU): TÌM KIẾM TRỰC TIẾP BẰNG TÊN PHIM + NĂM TRÊN VSMOV
        if (initialQueries.length > 0) {
            console.log("[VSMov] ⚡ Ưu tiên 1: Tìm kiếm trực tiếp không qua TMDB: " + JSON.stringify(initialQueries));
            return findBestSlug(initialQueries, targetYear, mediaType, targetSeason, targetTmdbId, targetImdbId).then(function (slug) {
                if (slug) {
                    console.log("[VSMov] ✅ Khớp slug trực tiếp từ tên phim: " + slug);
                    return fetchVSMovDetail(slug).then(function (data) {
                        if (!data) return null;
                        return extractStreamsFromVSMovData(data, mediaType, season, episode, preferredServer).then(function (streams) {
                            if (streams && streams.length > 0) {
                                console.log("[VSMov] 🚀 Trả về " + streams.length + " luồng phát (Tìm kiếm trực tiếp siêu tốc, 0 TMDB API).");
                                return streams;
                            }
                            return null;
                        });
                    });
                }
                return null;
            });
        }
        return null;
    }).then(function (foundSearchStreams) {
        if (foundSearchStreams && foundSearchStreams.length > 0) {
            return foundSearchStreams;
        }

        // 🛡️ BƯỚC 3: DỰ PHÒNG CUỐI CÙNG - Chỉ tra cứu TMDB Metadata khi không có tên phim hoặc tìm kiếm trực tiếp không ra kết quả
        console.log("[VSMov] 🔄 Dự phòng: Tra cứu TMDB Metadata để bổ sung danh sách tên & bí danh...");
        return getTmdbInfo(cleanId, mediaType).then(function (tmdbInfo) {
            var searchQueries = [];
            var finalYear = targetYear;

            if (tmdbInfo) {
                if (tmdbInfo.titleVi) searchQueries.push(tmdbInfo.titleVi);
                if (tmdbInfo.titleEn) searchQueries.push(tmdbInfo.titleEn);
                if (tmdbInfo.originalTitle) searchQueries.push(tmdbInfo.originalTitle);
                if (tmdbInfo.aliases && tmdbInfo.aliases.length > 0) {
                    searchQueries.push.apply(searchQueries, tmdbInfo.aliases.slice(0, 3));
                }
                if (tmdbInfo.year && !finalYear) finalYear = tmdbInfo.year;
            }

            if (initialQueries.length > 0) {
                initialQueries.forEach(function (q) {
                    if (searchQueries.indexOf(q) === -1) searchQueries.push(q);
                });
            }

            if (searchQueries.length === 0) {
                if (cleanId && !/^\d+$/.test(cleanId) && !cleanId.startsWith("tt")) {
                    searchQueries.push(cleanId.replace(/[-_]/g, " "));
                }
            }

            var finalTmdbId = targetTmdbId || (tmdbInfo && tmdbInfo.tmdbId ? tmdbInfo.tmdbId : null);
            var finalImdbId = targetImdbId || (tmdbInfo && tmdbInfo.imdbId ? tmdbInfo.imdbId : null);

            return findBestSlug(searchQueries, finalYear, mediaType, targetSeason, finalTmdbId, finalImdbId);
        }).then(function (slug) {
            if (!slug) {
                console.log("[VSMov] ❌ Không tìm thấy phim phù hợp trên VSMov.");
                return [];
            }

            console.log("[VSMov] ✅ Khớp slug dự phòng: " + slug);
            return fetchVSMovDetail(slug).then(function (data) {
                if (!data) return [];
                return extractStreamsFromVSMovData(data, mediaType, season, episode, preferredServer).then(function (streams) {
                    console.log("[VSMov] 🚀 Trả về " + streams.length + " luồng m3u8 phát native cho Nuvio.");
                    return streams;
                });
            });
        });
    }).catch(function (err) {
        console.error("[VSMov] ❌ Lỗi xử lý luồng:", err && err.message ? err.message : err);
        return [];
    });
}

// -----------------------------------------------------------------------------
// 10. ON SETTINGS
// -----------------------------------------------------------------------------
function onSettings() {
    return Promise.resolve([
        {
            type: "header",
            label: "Cấu hình Plugin VSMov"
        },
        {
            type: "select",
            key: "preferredServer",
            label: "Server ưu tiên",
            description: "Chọn loại bản dịch âm thanh / phụ đề mong muốn",
            options: [
                { label: "Tất cả Server", value: "all" },
                { label: "Chỉ Vietsub", value: "vietsub" },
                { label: "Chỉ Thuyết Minh", value: "thuyetminh" }
            ],
            defaultValue: "all"
        },
        {
            type: "info",
            label: "Nguồn phát",
            description: "Bóc tách luồng m3u8 HLS trực tiếp từ VSMov (vsmov.com). Tự động phân giải phụ đề WebVTT native."
        }
    ]);
}

// -----------------------------------------------------------------------------
// 11. EXPORTS (COMMONJS & GLOBAL FOR REACT NATIVE / HERMES)
// -----------------------------------------------------------------------------
if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        getStreams: getStreams,
        onSettings: onSettings,
        cleanIdPrefix: cleanIdPrefix,
        toSlug: toSlug,
        searchVSMov: searchVSMov,
        fetchVSMovDetail: fetchVSMovDetail,
        findBestSlug: findBestSlug,
        extractVsmovStream: extractVsmovStream,
        extractSubtitles: extractSubtitles,
        extractStreamsFromVSMovData: extractStreamsFromVSMovData
    };
} else {
    if (typeof global !== "undefined") {
        global.getStreams = getStreams;
        global.onSettings = onSettings;
    }
    if (typeof globalThis !== "undefined") {
        globalThis.getStreams = getStreams;
        globalThis.onSettings = onSettings;
    }
}
