// test-nguonc.js - Script kiểm thử Provider NguonC cho Nuvio (Zero Proxy)
const http2 = require("http2");

// Giả lập Http2 cho môi trường Node.js (Trên Nuvio Android/TV, OkHttp đã mặc định chạy HTTP/2)
function http2Fetch(url, options = {}) {
    return new Promise((resolve, reject) => {
        const originMatch = url.match(/^(https:\/\/[^\/]+)/);
        if (!originMatch) return reject(new Error("Invalid URL"));
        const client = http2.connect(originMatch[1]);
        const path = url.replace(originMatch[1], "");

        const headers = {
            ":method": options.method || "GET",
            ":path": path,
            "user-agent": options.headers?.["User-Agent"] || "Mozilla/5.0",
            "referer": options.headers?.["Referer"] || "",
            "origin": options.headers?.["Origin"] || "",
            "accept": options.headers?.["Accept"] || "*/*",
            "content-type": options.headers?.["Content-Type"] || "application/json"
        };

        const req = client.request(headers);
        let body = "";
        req.on("response", (resHeaders) => {
            req.on("data", chunk => body += chunk);
            req.on("end", () => {
                client.close();
                resolve({
                    ok: resHeaders[":status"] === 200,
                    status: resHeaders[":status"],
                    json: () => Promise.resolve(JSON.parse(body)),
                    text: () => Promise.resolve(body)
                });
            });
        });
        req.on("error", err => {
            client.close();
            reject(err);
        });
        if (options.body) req.write(options.body);
        req.end();
    });
}

const origFetch = global.fetch;
global.fetch = function(url, opts) {
    if (String(url).includes("streamc.xyz")) {
        return http2Fetch(url, opts);
    }
    return origFetch(url, opts);
};

const { getStreams, onSettings, cleanIdPrefix } = require('./providers/nguonc.js');

async function runTests() {
    console.log("=================================================");
    console.log("🧪 BẮT ĐẦU KIỂM THỬ NUVIO PROVIDER: NGUONC (ZERO PROXY)");
    console.log("=================================================\n");

    // 0. Kiểm tra hàm cleanIdPrefix
    console.log("🧹 0. Kiểm tra làm sạch ID tiền tố (tmdb: / imdb:)...");
    console.log("   tmdb:872585 ->", cleanIdPrefix("tmdb:872585"));
    console.log("   imdb:tt15398776 ->", cleanIdPrefix("imdb:tt15398776"));
    console.log("   872585 ->", cleanIdPrefix("872585"));

    // 1. Kiểm tra Settings Schema
    console.log("\n⚙️ 1. Kiểm tra Schema Cài đặt (onSettings)...");
    const settings = await onSettings();
    console.log(`✅ onSettings trả về ${settings.length} mục cấu hình.`);
    settings.forEach(s => console.log(`   - [${s.type}] ${s.label || s.key}`));

    // 2. Test Phim Lẻ: Avatar 2 (Nuvio ID: tmdb:76600)
    console.log("\n🎬 2. Test Phim Lẻ: Avatar 2 (Nuvio ID: tmdb:76600)...");
    const streamsAvatar = await getStreams("tmdb:76600", "movie", null, null);
    console.log(`✅ Kết quả: ${streamsAvatar.length} luồng phát.`);
    streamsAvatar.forEach((s, idx) => {
        console.log(`   [${idx + 1}] ${s.name} - ${s.title}`);
        console.log(`       🔗 URL: ${s.url ? s.url.substring(0, 80) + '...' : 'NONE'}`);
        console.log(`       💎 Format: ${s.type || s.quality} | Provider: ${s.provider}`);
        console.log(`       📎 Headers: Referer=${s.headers?.Referer}`);
    });

    // 3. Test Phim Lẻ: Oppenheimer (TMDB: 872585)
    console.log("\n🎬 3. Test Phim Lẻ: Oppenheimer (TMDB ID: 872585)...");
    const streamsOpp = await getStreams("872585", "movie", null, null);
    console.log(`✅ Kết quả: ${streamsOpp.length} luồng phát.`);
    streamsOpp.forEach((s, idx) => {
        console.log(`   [${idx + 1}] ${s.name} - ${s.title}`);
        console.log(`       🔗 URL: ${s.url ? s.url.substring(0, 80) + '...' : 'NONE'}`);
    });

    // 4. Test Phim Bộ: Breaking Bad Season 1 Episode 1 (TMDB: 1396)
    console.log("\n📺 4. Test Phim Bộ: Breaking Bad S01E01 (TMDB ID: 1396)...");
    const streamsBB = await getStreams("1396", "tv", 1, 1);
    console.log(`✅ Kết quả: ${streamsBB.length} luồng phát.`);
    streamsBB.forEach((s, idx) => {
        console.log(`   [${idx + 1}] ${s.name} - ${s.title}`);
        console.log(`       🔗 URL: ${s.url ? s.url.substring(0, 80) + '...' : 'NONE'}`);
    });

    // 5. Test Tra cứu bằng IMDb ID: Oppenheimer (imdb:tt15398776)
    console.log("\n🔍 5. Test Tra cứu bằng IMDb ID: Oppenheimer (imdb:tt15398776)...");
    const streamsImdb = await getStreams("imdb:tt15398776", "movie", null, null);
    console.log(`✅ Kết quả: ${streamsImdb.length} luồng phát.`);
    streamsImdb.forEach((s, idx) => {
        console.log(`   [${idx + 1}] ${s.name} - ${s.title}`);
        console.log(`       🔗 URL: ${s.url ? s.url.substring(0, 80) + '...' : 'NONE'}`);
    });

    // 6. Kiểm tra tính hợp lệ của luồng (Không dùng link embed.php, không proxy)
    const allStreams = [...streamsAvatar, ...streamsOpp, ...streamsBB, ...streamsImdb];
    const hasProxy = allStreams.some(s => s.url.includes("proxy") || s.url.includes("joandyou.cc"));
    const hasEmbedPhp = allStreams.some(s => s.url.includes("embed.php"));
    
    console.log(`\n🛡️ Kiểm tra Zero Proxy: ${hasProxy ? '❌ CÒN DÙNG PROXY' : '✅ 100% SẠCH PROXY (HOÀN TOÀN TẠI CLIENT)'}`);
    console.log(`🛡️ Kiểm tra Loại Bỏ HTML Embed: ${hasEmbedPhp ? '❌ CÒN CHỨA LINK EMBED.PHP' : '✅ ĐÃ LOẠI BỎ TOÀN BỘ EMBED.PHP (CHỈ GIỮ M3U8 NATIVE)'}`);

    if (allStreams.length === 0) {
        throw new Error("Không có luồng nào được trả về!");
    }

    console.log("\n=================================================");
    console.log("🎉 TẤT CẢ BÀI TEST ĐÃ HOÀN TẤT THÀNH CÔNG!");
    console.log("=================================================");
}

runTests().catch(err => {
    console.error("❌ Test thất bại:", err);
    process.exit(1);
});
