/**
 * =============================================================================
 * Nuvio Provider: Phim NguonC (Zero Proxy - Direct HLS Client Extractor)
 * ID: nguonc
 * Author: jtmy
 * Version: 1.2.1
 * 
 * 🎯 NGUYÊN LÝ HOẠT ĐỘNG:
 * - 100% Client-Side / Zero Proxy: Toàn bộ quá trình bóc tách diễn ra trực tiếp
 *   tại máy Client của người dùng (Hermes JS Engine trên Nuvio Mobile & TV).
 * - Giải mã link StreamC bootstrap API trực tiếp để lấy link m3u8 gốc không mã hoá.
 * - Tương thích hoàn toàn với ExoPlayer / MPV Player native của Nuvio.
 * - Hỗ trợ cả TMDB ID, IMDb ID và Meta title fallback.
 * =============================================================================
 */

// -----------------------------------------------------------------------------
// 1. CONFIGURATION & CONSTANTS
// -----------------------------------------------------------------------------
var BASE_URL = "https://phim.nguonc.com/api";
var DEFAULT_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
var TMDB_KEYS = [
    "fee0af381d9d9ec15ad158cf7f78c7f5",
    "e3b1be5bccccfda3542d7326f95e6887",
    "439c478a771f35c05022f9feabcca01c",
    "1865f43a0549ca50d341dd9ab8b29f49"
];

var CF_FALLBACK_PROXY = "https://j-proxy-fallback.khx.workers.dev/?url=";
var CODETABS_PROXY = "https://api.codetabs.com/v1/proxy?quest=";

// -----------------------------------------------------------------------------
// 2. STRING & URL HELPERS (HERMES COMPATIBLE - NO WHATWG URL DEPENDENCY)
// -----------------------------------------------------------------------------
function getOrigin(urlStr) {
    if (!urlStr) return "https://embed.streamc.xyz";
    var match = String(urlStr).match(/^(https?:\/\/[^\/]+)/i);
    return match ? match[1] : "https://embed.streamc.xyz";
}

function cleanIdPrefix(idStr) {
    if (!idStr) return "";
    return String(idStr).trim().replace(/^(tmdb|imdb):/i, "");
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

function extractVideoHash(urlStr) {
    if (!urlStr) return "";
    var match = urlStr.match(/hash=([a-f0-9]{32})/i) 
             || urlStr.match(/\/([a-f0-9]{32})(?:\/|\.|$|\?)/i)
             || urlStr.match(/([a-f0-9]{32})/i);
    return match ? match[1] : "";
}

// -----------------------------------------------------------------------------
// 3. NETWORK HELPERS (DIRECT CLIENT REQUESTS WITH SAFE FALLBACK)
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
            // Tầng dự phòng nếu mạng client bị chặn ISP
            var cfUrl = CF_FALLBACK_PROXY + encodeURIComponent(url);
            return fetch(cfUrl, { headers: headers })
                .then(function (cfRes) {
                    if (!cfRes.ok) throw new Error("CF HTTP " + cfRes.status);
                    return cfRes.json();
                })
                .catch(function () {
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
        return fetchJson(findUrl).then(function (data) {
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
                imdbId: idStr
            };
        });
    }

    // Tra cứu qua TMDB Numeric ID
    if (/^\d+$/.test(idStr)) {
        var urlVi = "https://api.themoviedb.org/3/" + typeEndpoint + "/" + idStr + "?api_key=" + apiKey + "&language=vi-VN&append_to_response=alternative_titles,external_ids";
        var urlEn = "https://api.themoviedb.org/3/" + typeEndpoint + "/" + idStr + "?api_key=" + apiKey + "&language=en-US&append_to_response=external_ids";

        return Promise.all([fetchJson(urlVi), fetchJson(urlEn)]).then(function (results) {
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
// 5. NGUONC SEARCH & SMART MATCHING ENGINE
// -----------------------------------------------------------------------------
function searchNguonC(keyword) {
    if (!keyword) return Promise.resolve([]);
    var url = BASE_URL + "/films/search?keyword=" + encodeURIComponent(keyword) + "&page=1";
    return fetchJson(url).then(function (data) {
        if (!data) return [];
        return data.items || (data.data && data.data.items) || [];
    });
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

/**
 * Thuật toán chấm điểm trọng số mức độ tương đồng giữa kết quả NguonC và metadata chuẩn TMDB.
 * Đảm bảo chọn đúng phim ngay cả khi uploader đặt tên lộn xộn, sai chính tả, hoặc trùng tên remake.
 */
function calculateMatchScore(candidate, searchQueries, targetYear, isTv, targetSeason) {
    var candName = normalizeStr(candidate.name || "");
    var candOrig = normalizeStr(candidate.original_name || "");
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
        var yStr = candidate.year || (candidate.created ? candidate.created.substring(0, 4) : "");
        var cYear = parseInt(yStr, 10);
        if (cYear && tYear) {
            if (cYear === tYear) {
                totalScore += 30; // Trùng năm chính xác tuyệt đối
            } else if (Math.abs(cYear - tYear) === 1) {
                totalScore += 15; // Lệch 1 năm (do năm chiếu rạp vs năm ra bản Digital)
            } else {
                totalScore -= 40; // Lệch nhiều năm: Trừ nặng điểm để tránh nhầm phim Remake/Reboot
            }
        }
    }

    // 5. Chấm điểm Mùa (Season) cho Phim bộ
    if (isTv) {
        var seasonText = (candidate.slug + " " + (candidate.name || "") + " " + (candidate.original_name || "")).toLowerCase();
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
            totalScore += 20; // Mùa 1 thường web không ghi số phần
        } else {
            totalScore -= 50; // Sai mùa: Trừ điểm nặng
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
        // Tách thêm subtitle ngắn gọn nếu có dấu : hoặc - (VD: "Spider-Man: No Way Home" -> "No Way Home")
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
        return searchNguonC(currentQuery).then(function (items) {
            if (!items || items.length === 0) {
                return tryNextQuery(index + 1);
            }

            // BƯỚC 1: Ưu tiên tuyệt đối nếu NguonC có sẵn ID TMDB hoặc IMDb
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
                    console.log("[NguonC] 🎯 Khớp chính xác 100% bằng ID (TMDB/IMDb): " + exactIdMatch.slug);
                    return Promise.resolve(exactIdMatch.slug);
                }
            }

            // BƯỚC 2: Lọc sơ bộ theo loại hình Phim lẻ vs Phim bộ
            var candidates = items.filter(function (it) {
                var totalEps = parseInt(it.total_episodes || it.episode_total || "1", 10);
                var curEp = String(it.current_episode || it.episode_current || "").toLowerCase();
                var itIsSeries = totalEps > 2 || curEp.includes("tập") || curEp.includes("tap") || it.slug.includes("phan-");

                if (!isTv && itIsSeries && totalEps > 2) {
                    return false;
                }
                return true;
            });

            if (candidates.length === 0) candidates = items;

            // BƯỚC 3: Chấm điểm trọng số độ tương đồng cho tất cả ứng viên
            var scoredCandidates = candidates.map(function (it) {
                return {
                    slug: it.slug,
                    name: it.name,
                    score: calculateMatchScore(it, searchQueries, targetYear, isTv, targetSeason)
                };
            });

            // Sắp xếp theo điểm giảm dần
            scoredCandidates.sort(function (a, b) {
                return b.score - a.score;
            });

            var best = scoredCandidates[0];
            if (best && best.score > 25) {
                console.log("[NguonC] 🏆 Khớp phim có điểm cao nhất: " + best.slug + " (Điểm: " + best.score + ")");
                return Promise.resolve(best.slug);
            }

            // Nếu điểm quá thấp (< 25), khả năng cao search từ khoá này bị lệch, thử từ khoá tiếp theo
            return tryNextQuery(index + 1);
        });
    }

    return tryNextQuery(0);
}

// -----------------------------------------------------------------------------
// 6. CLIENT-SIDE STREAMC BOOTSTRAP (100% DIRECT HLS EXTRACTION - ZERO PROXY)
// -----------------------------------------------------------------------------
/**
 * Gọi trực tiếp API bootstrap nội bộ của StreamC tại client Nuvio.
 * StreamC trả về URL playlist HLS unencrypted trực tiếp trong data.preissued.playlist.
 */
function tryFetchDirectHls(embedUrl) {
    if (!embedUrl) return Promise.resolve(null);
    var videoHash = extractVideoHash(embedUrl);
    if (!videoHash) return Promise.resolve(null);

    var origin = getOrigin(embedUrl);
    var postBody = {
        action: "bootstrap",
        referrer: "https://phim.nguonc.com/",
        request_grant: true,
        playlist_format: "hls",
        pretty_url: true,
        path_chunks: true,
        bootstrap_format: "json"
    };

    var headers = {
        "Accept": "*/*",
        "Content-Type": "application/json",
        "Referer": embedUrl,
        "Origin": origin,
        "User-Agent": DEFAULT_UA
    };

    return fetch(embedUrl, {
        method: "POST",
        headers: headers,
        body: JSON.stringify(postBody)
    }).then(function (res) {
        if (!res.ok) throw new Error("StreamC bootstrap HTTP " + res.status);
        return res.json();
    }).then(function (data) {
        if (data && data.preissued && data.preissued.playlist) {
            return data.preissued.playlist;
        }
        return null;
    }).catch(function () {
        // Fallback: Thử lấy qua Cloudflare worker proxy nếu mạng client bị chặn
        var cfUrl = CF_FALLBACK_PROXY + encodeURIComponent(embedUrl);
        return fetch(cfUrl, {
            method: "POST",
            headers: headers,
            body: JSON.stringify(postBody)
        }).then(function (res) {
            if (!res.ok) return null;
            return res.json();
        }).then(function (data) {
            if (data && data.preissued && data.preissued.playlist) {
                return data.preissued.playlist;
            }
            return null;
        }).catch(function () {
            // Fallback 2: Thử cào regex từ mã nguồn HTML embed
            return tryExtractFromHtml(embedUrl);
        });
    });
}

function tryExtractFromHtml(embedUrl) {
    if (!embedUrl) return Promise.resolve(null);
    return fetch(embedUrl, {
        headers: {
            "User-Agent": DEFAULT_UA,
            "Referer": "https://phim.nguonc.com/"
        }
    }).then(function (res) {
        if (!res.ok) return null;
        return res.text();
    }).then(function (html) {
        if (!html) return null;
        var m3u8Regex = /file:\s*["']([^"']+\.m3u8[^"']*)["']|source:\s*["']([^"']+\.m3u8[^"']*)["']|src:\s*["']([^"']+\.m3u8[^"']*)["']|["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/;
        var match = html.match(m3u8Regex);
        return match ? (match[1] || match[2] || match[3] || match[4]) : null;
    }).catch(function () {
        return null;
    });
}

// -----------------------------------------------------------------------------
// 7. STREAM EXTRACTION (DIRECT M3U8 & ZERO PROXY STREAMC BOOTSTRAP)
// -----------------------------------------------------------------------------
function extractStreamsFromNguonCData(data, mediaType, season, episode, preferredServer) {
    if (!data) return Promise.resolve([]);

    var movie = data.movie || data.film || {};
    var episodes = movie.episodes || data.episodes || [];
    var movieTitle = movie.name || movie.original_name || "Phim";
    var movieQuality = movie.quality || "1080p";

    var isTv = mediaType === "tv" || mediaType === "series" || (season !== null && season !== undefined && parseInt(season, 10) > 0);
    var targetEpNum = episode ? parseInt(episode, 10) : 1;

    var streams = [];
    var directHlsPromises = [];

    episodes.forEach(function (server) {
        var serverName = (server.server_name || "Server").replace(/Server:\s*/gi, "").trim();
        var items = server.items || server.server_data || [];
        if (!items || items.length === 0) return;

        var targetEp = null;
        if (isTv && episode !== null && episode !== undefined) {
            targetEp = items.find(function (e) {
                var numMatch = String(e.name || "").match(/\d+/);
                var n = numMatch ? parseInt(numMatch[0], 10) : null;
                var slugMatch = String(e.slug || "").includes("tap-" + targetEpNum);
                return n === targetEpNum || slugMatch;
            });
            if (!targetEp && items.length === 1 && targetEpNum === 1) {
                targetEp = items[0];
            }
        } else {
            targetEp = items.find(function (e) {
                return /full/i.test(e.name || "") || e.slug === "tap-full";
            }) || items[0];
        }

        if (!targetEp) return;

        var epName = targetEp.name || (isTv ? "Tập " + targetEpNum : "Full");
        var rawEmbed = targetEp.embed || targetEp.link_embed || "";
        var rawM3u8 = targetEp.m3u8 || targetEp.link_m3u8 || "";

        // Trường hợp 1: Có m3u8 trực tiếp trong API NguonC
        if (rawM3u8) {
            streams.push({
                name: "NguonC [" + serverName + "]",
                title: movieTitle + " - " + epName + " (" + movieQuality + ")",
                url: rawM3u8,
                quality: movieQuality,
                type: "hls",
                headers: {
                    "User-Agent": DEFAULT_UA,
                    "Referer": "https://embed.streamc.xyz/"
                },
                provider: "nguonc"
            });
        }

        // Trường hợp 2: Bóc tách m3u8 trực tiếp từ link embed (Zero Proxy)
        if (rawEmbed) {
            directHlsPromises.push(
                tryFetchDirectHls(rawEmbed).then(function (directHls) {
                    if (directHls) {
                        streams.push({
                            name: "NguonC [" + serverName + "]",
                            title: movieTitle + " - " + epName + " (" + movieQuality + ")",
                            url: directHls,
                            quality: movieQuality,
                            type: "hls",
                            headers: {
                                "User-Agent": DEFAULT_UA,
                                "Referer": rawEmbed
                            },
                            provider: "nguonc"
                        });
                    }
                })
            );
        }
    });

    return Promise.all(directHlsPromises).then(function () {
        // Lọc theo cài đặt server ưu tiên
        if (preferredServer === "vietsub") {
            var filtered = streams.filter(function (s) { return /vietsub/i.test(s.name); });
            if (filtered.length > 0) streams = filtered;
        } else if (preferredServer === "thuyetminh") {
            var filtered = streams.filter(function (s) { return /thuyết minh|thuyet minh/i.test(s.name); });
            if (filtered.length > 0) streams = filtered;
        }

        return streams;
    });
}

// -----------------------------------------------------------------------------
// 8. MAIN getStreams (EXPORTED TO NUVIO SCRAPERS ENGINE)
// -----------------------------------------------------------------------------
function getStreams(tmdbId, mediaType, season, episode, meta) {
    console.log("[NguonC] 🔍 Tra cứu luồng: ID=" + tmdbId + ", type=" + mediaType + ", S=" + season + ", E=" + episode);

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
        directSlugPromise = fetchJson(BASE_URL + "/film/" + directSlug).then(function (detailRes) {
            if (detailRes && (detailRes.movie || detailRes.film)) {
                console.log("[NguonC] ✅ Khớp slug trực tiếp: " + directSlug);
                return extractStreamsFromNguonCData(detailRes, mediaType, season, episode, preferredServer);
            }
            return null;
        });
    }

    return directSlugPromise.then(function (foundDirectStreams) {
        if (foundDirectStreams && foundDirectStreams.length > 0) {
            return foundDirectStreams;
        }

        // ⚡ BƯỚC 2 (ƯU TIÊN HÀNG ĐẦU): TÌM KIẾM TRỰC TIẾP BẰNG TÊN PHIM + NĂM TRÊN NGUONC
        if (initialQueries.length > 0) {
            console.log("[NguonC] ⚡ Ưu tiên 1: Tìm kiếm trực tiếp không qua TMDB: " + JSON.stringify(initialQueries));
            return findBestSlug(initialQueries, targetYear, mediaType, targetSeason, targetTmdbId, targetImdbId).then(function (slug) {
                if (slug) {
                    console.log("[NguonC] ✅ Khớp slug trực tiếp từ tên phim: " + slug);
                    return fetchJson(BASE_URL + "/film/" + slug).then(function (data) {
                        if (!data) return null;
                        return extractStreamsFromNguonCData(data, mediaType, season, episode, preferredServer).then(function (streams) {
                            if (streams && streams.length > 0) {
                                console.log("[NguonC] 🚀 Trả về " + streams.length + " luồng phát (Tìm kiếm trực tiếp siêu tốc, 0 TMDB API).");
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
        console.log("[NguonC] 🔄 Dự phòng: Tra cứu TMDB Metadata để bổ sung danh sách tên & bí danh...");
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
                console.log("[NguonC] ❌ Không tìm thấy phim phù hợp trên NguonC.");
                return [];
            }

            console.log("[NguonC] ✅ Khớp slug dự phòng: " + slug);
            return fetchJson(BASE_URL + "/film/" + slug).then(function (data) {
                if (!data) return [];
                return extractStreamsFromNguonCData(data, mediaType, season, episode, preferredServer).then(function (streams) {
                    console.log("[NguonC] 🚀 Trả về " + streams.length + " luồng m3u8 phát native cho Nuvio.");
                    return streams;
                });
            });
        });
    }).catch(function (err) {
        console.error("[NguonC] ❌ Lỗi xử lý luồng:", err && err.message ? err.message : err);
        return [];
    });
}

// -----------------------------------------------------------------------------
// 8. ON SETTINGS
// -----------------------------------------------------------------------------
function onSettings() {
    return Promise.resolve([
        {
            type: "header",
            label: "Cấu hình Plugin NguonC"
        },
        {
            type: "select",
            key: "preferredServer",
            label: "Server ưu tiên",
            description: "Chọn loại âm thanh / phụ đề mong muốn",
            options: [
                { label: "Tất cả Server", value: "all" },
                { label: "Chỉ Vietsub", value: "vietsub" },
                { label: "Chỉ Thuyết Minh", value: "thuyetminh" }
            ],
            defaultValue: "all"
        },
        {
            type: "info",
            label: "Cơ chế bóc tách",
            description: "Bóc tách HLS trực tiếp tại Client qua StreamC Bootstrap (Zero Proxy). Phát mượt trên ExoPlayer Native."
        }
    ]);
}

// -----------------------------------------------------------------------------
// 9. EXPORTS (COMMONJS & GLOBAL FOR REACT NATIVE / HERMES)
// -----------------------------------------------------------------------------
if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        getStreams: getStreams,
        onSettings: onSettings,
        cleanIdPrefix: cleanIdPrefix,
        getOrigin: getOrigin,
        tryFetchDirectHls: tryFetchDirectHls
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
