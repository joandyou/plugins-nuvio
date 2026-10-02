/**
 * =============================================================================
 * Nuvio Provider: Phim KKPhim (phimapi.com)
 * ID: kkphim
 * Author: jtmy
 * Version: 1.0.0
 * 
 * 🎯 NGUYÊN LÝ HOẠT ĐỘNG:
 * - 100% Client-Side / Zero Proxy: Toàn bộ quá trình diễn ra trực tiếp tại Client
 *   (Hermes JS Engine trên Nuvio Mobile, Android TV, iOS, Windows, macOS).
 * - Luồng m3u8 HLS có sẵn trực tiếp từ API KKPhim (phimapi.com).
 * - Tối ưu tốc độ với Fast TMDB Mapping API của KKPhim.
 * - Thuật toán Smart Match (Token Overlap, Year Tolerance & Season Match).
 * - Tương thích hoàn toàn với ExoPlayer / MPV Player native của Nuvio.
 * =============================================================================
 */

// -----------------------------------------------------------------------------
// 1. CONFIGURATION & CONSTANTS
// -----------------------------------------------------------------------------
var BASE_URL = "https://phimapi.com";
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
// 5. KKPHIM API CLIENT
// -----------------------------------------------------------------------------
function fetchKkphimTmdb(tmdbId, mediaType) {
    if (!tmdbId || !/^\d+$/.test(String(tmdbId))) return Promise.resolve(null);
    var kkType = (mediaType === "tv" || mediaType === "series") ? "tv" : "movie";
    var url = BASE_URL + "/tmdb/" + kkType + "/" + tmdbId;
    return cachedFetchJson(url).then(function (res) {
        if (res && (res.status === true || res.status === "success") && res.movie) {
            return res;
        }
        return null;
    }).catch(function () {
        return null;
    });
}

function searchKKPhim(keyword) {
    if (!keyword) return Promise.resolve([]);
    var url = BASE_URL + "/v1/api/tim-kiem?keyword=" + encodeURIComponent(keyword) + "&limit=10";
    return cachedFetchJson(url).then(function (res) {
        if (!res) return [];
        return (res.data && res.data.items) || res.items || [];
    }).catch(function () {
        return [];
    });
}

function fetchKkphimDetail(slug) {
    if (!slug) return Promise.resolve(null);
    var url = BASE_URL + "/phim/" + slug;
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
// 6. SMART MATCHING ALGORITHM
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

    // Kiểm tra thêm tên phụ trong alternative_names nếu có
    if (candidate.alternative_names && Array.isArray(candidate.alternative_names)) {
        candidate.alternative_names.forEach(function (alt) {
            var normAlt = normalizeStr(alt);
            searchQueries.forEach(function (q) {
                var normQ = normalizeStr(q);
                if (normAlt === normQ) {
                    bestTextScore = Math.max(bestTextScore, 95);
                } else if (normAlt.indexOf(normQ) >= 0) {
                    bestTextScore = Math.max(bestTextScore, 65);
                }
            });
        });
    }

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
            new RegExp("phần " + targetSeason + "\\b", "i")
        ];
        var isSeasonMatch = seasonPatterns.some(function (p) { return p.test(seasonText); });
        if (isSeasonMatch) {
            totalScore += 40; // Đúng mùa
        } else if (targetSeason === 1 && !/phan[- ]\d|phần \d|season[- ]\d/i.test(seasonText)) {
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
        return searchKKPhim(currentQuery).then(function (items) {
            if (!items || items.length === 0) {
                return tryNextQuery(index + 1);
            }

            // BƯỚC 1: Ưu tiên tuyệt đối nếu KKPhim có sẵn ID TMDB hoặc IMDb
            if (targetTmdbId || targetImdbId) {
                var exactIdMatch = items.find(function (it) {
                    if (targetTmdbId && it.tmdb && it.tmdb.id && String(it.tmdb.id) === String(targetTmdbId)) {
                        if (isTv && it.tmdb.season && parseInt(it.tmdb.season, 10) !== targetSeason) return false;
                        return true;
                    }
                    if (targetImdbId && it.imdb && it.imdb.id && String(it.imdb.id) === String(targetImdbId)) {
                        return true;
                    }
                    return false;
                });
                if (exactIdMatch) {
                    console.log("[KKPhim] 🎯 Khớp chính xác 100% bằng ID (TMDB/IMDb): " + exactIdMatch.slug);
                    return Promise.resolve(exactIdMatch.slug);
                }
            }

            // BƯỚC 2: Lọc sơ bộ theo loại hình Phim lẻ vs Phim bộ
            var candidates = items.filter(function (it) {
                var totalEps = parseInt(it.total_episodes || it.episode_total || "1", 10);
                var curEp = String(it.current_episode || it.episode_current || "").toLowerCase();
                var rawType = String(it.type || "").toLowerCase();
                var itIsSeries = rawType.includes("series") || rawType.includes("tvshows") || totalEps > 2 || curEp.includes("tập") || curEp.includes("tap") || it.slug.includes("phan-");

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
                console.log("[KKPhim] 🏆 Khớp phim có điểm cao nhất: " + best.slug + " (Điểm: " + best.score + ")");
                return Promise.resolve(best.slug);
            }

            return tryNextQuery(index + 1);
        });
    }

    return tryNextQuery(0);
}

// -----------------------------------------------------------------------------
// 7. STREAM EXTRACTION (DIRECT M3U8 FROM KKPHIM API)
// -----------------------------------------------------------------------------
function extractStreamsFromKkphimData(data, mediaType, season, episode, preferredServer) {
    if (!data) return [];

    var movie = data.movie || data.item || (data.data && data.data.item) || {};
    var episodes = data.episodes || (data.movie && data.movie.episodes) || (data.data && data.data.item && data.data.item.episodes) || [];

    var movieTitle = movie.name || movie.origin_name || "Phim";
    var movieQuality = movie.quality || "HD";

    var isTv = mediaType === "tv" || mediaType === "series" || (season !== null && season !== undefined && parseInt(season, 10) > 0);
    var targetEpNum = episode ? parseInt(episode, 10) : 1;

    var streams = [];
    var seenUrls = {};

    episodes.forEach(function (server) {
        var rawServerName = server.server_name || "Server";
        var cleanServerName = String(rawServerName)
            .replace(/Server:\s*|#Hà Nội\s*/gi, "")
            .trim() || "VIP";

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
        var rawM3u8 = targetEp.link_m3u8 || targetEp.m3u8 || targetEp.file || "";

        // Trích xuất link m3u8 từ player link_embed nếu link_m3u8 trống
        if (!rawM3u8 && targetEp.link_embed) {
            var matchUrl = String(targetEp.link_embed).match(/[?&]url=([^&]+)/i);
            if (matchUrl) {
                rawM3u8 = decodeURIComponent(matchUrl[1]);
            }
        }

        if (rawM3u8 && !seenUrls[rawM3u8]) {
            seenUrls[rawM3u8] = true;
            streams.push({
                name: "KKPhim [" + cleanServerName + "]",
                title: movieTitle + " - " + epName + " (" + movieQuality + ")",
                url: rawM3u8,
                quality: movieQuality,
                type: "hls",
                headers: {
                    "User-Agent": DEFAULT_UA,
                    "Referer": "https://phimapi.com/"
                },
                provider: "kkphim"
            });
        }
    });

    // Lọc theo cấu hình Server ưu tiên
    if (preferredServer === "vietsub") {
        var filteredVs = streams.filter(function (s) { return /vietsub/i.test(s.name); });
        if (filteredVs.length > 0) streams = filteredVs;
    } else if (preferredServer === "thuyetminh") {
        var filteredTm = streams.filter(function (s) { return /thuyết minh|thuyet minh/i.test(s.name); });
        if (filteredTm.length > 0) streams = filteredTm;
    } else if (preferredServer === "longtieng") {
        var filteredLt = streams.filter(function (s) { return /lồng tiếng|long tieng/i.test(s.name); });
        if (filteredLt.length > 0) streams = filteredLt;
    }

    return streams;
}

// -----------------------------------------------------------------------------
// 8. MAIN getStreams (EXPORTED TO NUVIO SCRAPERS ENGINE)
// -----------------------------------------------------------------------------
function getStreams(tmdbId, mediaType, season, episode, meta) {
    console.log("[KKPhim] 🔍 Tra cứu luồng: ID=" + tmdbId + ", type=" + mediaType + ", S=" + season + ", E=" + episode);

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
        directSlugPromise = fetchKkphimDetail(directSlug).then(function (detailRes) {
            if (detailRes && (detailRes.movie || detailRes.item)) {
                console.log("[KKPhim] ✅ Khớp slug trực tiếp: " + directSlug);
                var slugStreams = extractStreamsFromKkphimData(detailRes, mediaType, season, episode, preferredServer);
                if (slugStreams.length > 0) return slugStreams;
            }
            return null;
        });
    }

    return directSlugPromise.then(function (foundDirectStreams) {
        if (foundDirectStreams && foundDirectStreams.length > 0) {
            return foundDirectStreams;
        }

        // ⚡ BƯỚC 2 (ƯU TIÊN HÀNG ĐẦU): TÌM KIẾM TRỰC TIẾP BẰNG TÊN PHIM + NĂM TRÊN KKPHIM
        if (initialQueries.length > 0) {
            console.log("[KKPhim] ⚡ Ưu tiên 1: Tìm kiếm trực tiếp không qua TMDB: " + JSON.stringify(initialQueries));
            return findBestSlug(initialQueries, targetYear, mediaType, targetSeason, targetTmdbId, targetImdbId).then(function (slug) {
                if (slug) {
                    console.log("[KKPhim] ✅ Khớp slug trực tiếp từ tên phim: " + slug);
                    return fetchKkphimDetail(slug).then(function (data) {
                        if (!data) return null;
                        var streams = extractStreamsFromKkphimData(data, mediaType, season, episode, preferredServer);
                        if (streams.length > 0) {
                            console.log("[KKPhim] 🚀 Trả về " + streams.length + " luồng phát (Tìm kiếm trực tiếp siêu tốc, 0 TMDB API).");
                            return streams;
                        }
                        return null;
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

        // ⚡ BƯỚC 3: Nếu tmdbId là mã số TMDB, thử Fast Mapping API của KKPhim
        if (/^\d+$/.test(cleanId)) {
            return fetchKkphimTmdb(cleanId, mediaType).then(function (fastRes) {
                if (fastRes && fastRes.movie && fastRes.episodes && fastRes.episodes.length > 0) {
                    var fastSeason = fastRes.movie.tmdb && fastRes.movie.tmdb.season ? parseInt(fastRes.movie.tmdb.season, 10) : null;
                    if (!isTv || !fastSeason || fastSeason === targetSeason) {
                        console.log("[KKPhim] ⚡ Fast TMDB Direct Match thành công cho: " + fastRes.movie.name);
                        var fastStreams = extractStreamsFromKkphimData(fastRes, mediaType, season, episode, preferredServer);
                        if (fastStreams.length > 0) {
                            console.log("[KKPhim] 🚀 Trả về " + fastStreams.length + " luồng phát (KKPhim Fast TMDB Path).");
                            return fastStreams;
                        }
                    }
                }
                return null;
            });
        }
        return null;
    }).then(function (foundFastStreams) {
        if (foundFastStreams && foundFastStreams.length > 0) {
            return foundFastStreams;
        }

        // 🛡️ BƯỚC 4: DỰ PHÒNG CUỐI CÙNG - Chỉ tra cứu TMDB Metadata khi không có tên phim hoặc tìm kiếm trực tiếp không ra kết quả
        console.log("[KKPhim] 🔄 Dự phòng: Tra cứu TMDB Metadata để bổ sung danh sách tên & bí danh...");
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
                console.log("[KKPhim] ❌ Không tìm thấy phim phù hợp trên KKPhim.");
                return [];
            }

            console.log("[KKPhim] ✅ Khớp slug dự phòng: " + slug);
            return fetchKkphimDetail(slug).then(function (data) {
                if (!data) return [];
                var streams = extractStreamsFromKkphimData(data, mediaType, season, episode, preferredServer);
                console.log("[KKPhim] 🚀 Trả về " + streams.length + " luồng m3u8 phát native cho Nuvio.");
                return streams;
            });
        });
    }).catch(function (err) {
        console.error("[KKPhim] ❌ Lỗi xử lý luồng:", err && err.message ? err.message : err);
        return [];
    });
}

// -----------------------------------------------------------------------------
// 9. ON SETTINGS
// -----------------------------------------------------------------------------
function onSettings() {
    return Promise.resolve([
        {
            type: "header",
            label: "Cấu hình Plugin KKPhim"
        },
        {
            type: "select",
            key: "preferredServer",
            label: "Server ưu tiên",
            description: "Chọn loại bản dịch âm thanh / phụ đề mong muốn",
            options: [
                { label: "Tất cả Server", value: "all" },
                { label: "Chỉ Vietsub", value: "vietsub" },
                { label: "Chỉ Thuyết Minh", value: "thuyetminh" },
                { label: "Chỉ Lồng Tiếng", value: "longtieng" }
            ],
            defaultValue: "all"
        },
        {
            type: "info",
            label: "Nguồn phát",
            description: "Luồng m3u8 HLS trực tiếp từ API KKPhim (phimapi.com). Phát mượt native trên ExoPlayer / MPV không qua proxy."
        }
    ]);
}

// -----------------------------------------------------------------------------
// 10. EXPORTS (COMMONJS & GLOBAL FOR REACT NATIVE / HERMES)
// -----------------------------------------------------------------------------
if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        getStreams: getStreams,
        onSettings: onSettings,
        cleanIdPrefix: cleanIdPrefix,
        toSlug: toSlug,
        fetchKkphimTmdb: fetchKkphimTmdb,
        searchKKPhim: searchKKPhim,
        fetchKkphimDetail: fetchKkphimDetail,
        findBestSlug: findBestSlug,
        extractStreamsFromKkphimData: extractStreamsFromKkphimData
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
