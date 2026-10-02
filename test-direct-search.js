// test-direct-search.js - Kiểm thử cơ chế Direct Provider Search First (Ưu tiên tìm kiếm trực tiếp không qua TMDB)
const http2 = require("http2");

// Giả lập Http2 cho Node.js khi gọi StreamC của NguonC
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

const kkphim = require('./providers/kkphim.js');
const nguonc = require('./providers/nguonc.js');
const vsmov = require('./providers/vsmov.js');

async function testAll() {
    console.log("=================================================");
    console.log("⚡ KIỂM THỬ DIRECT SEARCH FIRST (TÊN PHIM + NĂM)");
    console.log("=================================================\n");

    const cases = [
        {
            name: "Phim Lẻ: Oppenheimer (2023)",
            id: "tmdb:872585",
            type: "movie",
            season: null,
            episode: null,
            meta: { title: "Oppenheimer", year: "2023" }
        },
        {
            name: "Phim Lẻ: Avengers: Endgame (2019)",
            id: "tmdb:299534",
            type: "movie",
            season: null,
            episode: null,
            meta: { title: "Avengers: Endgame", year: "2019" }
        },
        {
            name: "Phim Bộ: Breaking Bad S01E01 (2008)",
            id: "tmdb:1396",
            type: "tv",
            season: 1,
            episode: 1,
            meta: { title: "Breaking Bad", year: "2008" }
        }
    ];

    for (const c of cases) {
        console.log(`\n-------------------------------------------------`);
        console.log(`🎬 Đang test: ${c.name}`);
        console.log(`-------------------------------------------------`);

        // 1. KKPhim
        console.time("⏱️ KKPhim");
        const kkStreams = await kkphim.getStreams(c.id, c.type, c.season, c.episode, c.meta);
        console.timeEnd("⏱️ KKPhim");
        console.log(`   👉 KKPhim: ${kkStreams.length} luồng phát`);
        if (kkStreams[0]) console.log(`      🔗 Luồng 1: ${kkStreams[0].name} | ${kkStreams[0].title} | ${kkStreams[0].url.substring(0, 60)}...`);

        // 2. NguonC
        console.time("⏱️ NguonC");
        const ncStreams = await nguonc.getStreams(c.id, c.type, c.season, c.episode, c.meta);
        console.timeEnd("⏱️ NguonC");
        console.log(`   👉 NguonC: ${ncStreams.length} luồng phát`);
        if (ncStreams[0]) console.log(`      🔗 Luồng 1: ${ncStreams[0].name} | ${ncStreams[0].title} | ${ncStreams[0].url.substring(0, 60)}...`);

        // 3. VSMov
        console.time("⏱️ VSMov");
        const vsStreams = await vsmov.getStreams(c.id, c.type, c.season, c.episode, c.meta);
        console.timeEnd("⏱️ VSMov");
        console.log(`   👉 VSMov: ${vsStreams.length} luồng phát`);
        if (vsStreams[0]) console.log(`      🔗 Luồng 1: ${vsStreams[0].name} | ${vsStreams[0].title} | ${vsStreams[0].url.substring(0, 60)}...`);
    }

    console.log("\n=================================================");
    console.log("🎉 TẤT CẢ TEST DIRECT SEARCH FIRST ĐÃ HOÀN TẤT!");
    console.log("=================================================");
}

testAll().catch(err => {
    console.error("❌ Test error:", err);
    process.exit(1);
});
