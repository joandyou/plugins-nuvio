// test-vsmov.js - Script kiểm thử Provider VSMov cho Nuvio
const { getStreams, onSettings, cleanIdPrefix } = require('./providers/vsmov.js');

async function runTests() {
    console.log("=================================================");
    console.log("🧪 BẮT ĐẦU KIỂM THỬ NUVIO PROVIDER: VSMOV (DIRECT M3U8)");
    console.log("=================================================\n");

    // 0. Kiểm tra làm sạch ID tiền tố
    console.log("🧹 0. Kiểm tra làm sạch ID tiền tố...");
    console.log("   tmdb:157336 ->", cleanIdPrefix("tmdb:157336"));
    console.log("   imdb:tt0816692 ->", cleanIdPrefix("imdb:tt0816692"));
    console.log("   vsmov_ho-den-tu-than ->", cleanIdPrefix("vsmov_ho-den-tu-than"));

    // 1. Kiểm tra Settings Schema
    console.log("\n⚙️ 1. Kiểm tra Schema Cài đặt (onSettings)...");
    const settings = await onSettings();
    console.log(`✅ onSettings trả về ${settings.length} mục cấu hình.`);
    settings.forEach(s => console.log(`   - [${s.type}] ${s.label || s.key}`));

    // 2. Test Phim Lẻ: Interstellar (TMDB ID: 157336)
    console.log("\n🎬 2. Test Phim Lẻ: Interstellar (TMDB ID: 157336)...");
    const streamsInter = await getStreams("157336", "movie", null, null);
    console.log(`✅ Kết quả: ${streamsInter.length} luồng phát.`);
    streamsInter.forEach((s, idx) => {
        console.log(`   [${idx + 1}] ${s.name} - ${s.title}`);
        console.log(`       🔗 URL: ${s.url ? s.url.substring(0, 80) + '...' : 'NONE'}`);
        console.log(`       💎 Format: ${s.type || s.quality} | Provider: ${s.provider}`);
        console.log(`       📎 Headers: Referer=${s.headers?.Referer}`);
        console.log(`       💬 Subtitles: ${s.subtitles?.length || 0} phụ đề (${s.subtitles?.map(sub => sub.label).join(', ') || 'None'})`);
    });

    // 3. Test Phim Lẻ: Oppenheimer qua IMDb ID (imdb:tt15398776)
    console.log("\n🎬 3. Test Phim Lẻ: Oppenheimer qua IMDb ID (imdb:tt15398776)...");
    const streamsOpp = await getStreams("imdb:tt15398776", "movie", null, null);
    console.log(`✅ Kết quả: ${streamsOpp.length} luồng phát.`);
    streamsOpp.forEach((s, idx) => {
        console.log(`   [${idx + 1}] ${s.name} - ${s.title}`);
        console.log(`       🔗 URL: ${s.url ? s.url.substring(0, 80) + '...' : 'NONE'}`);
        console.log(`       💬 Subtitles: ${s.subtitles?.length || 0} phụ đề`);
    });

    // 4. Test Phim Bộ: Breaking Bad Season 1 Episode 1 (TMDB ID: 1396)
    console.log("\n📺 4. Test Phim Bộ: Breaking Bad S01E01 (TMDB ID: 1396)...");
    const streamsBB = await getStreams("1396", "tv", 1, 1);
    console.log(`✅ Kết quả: ${streamsBB.length} luồng phát.`);
    streamsBB.forEach((s, idx) => {
        console.log(`   [${idx + 1}] ${s.name} - ${s.title}`);
        console.log(`       🔗 URL: ${s.url ? s.url.substring(0, 80) + '...' : 'NONE'}`);
        console.log(`       💬 Subtitles: ${s.subtitles?.length || 0} phụ đề`);
    });

    // 5. Test Phim Bộ: Stranger Things Season 4 Episode 1 (TMDB ID: 66732)
    console.log("\n📺 5. Test Phim Bộ: Stranger Things S04E01 (TMDB ID: 66732)...");
    const streamsST = await getStreams("66732", "tv", 4, 1);
    console.log(`✅ Kết quả: ${streamsST.length} luồng phát.`);
    streamsST.forEach((s, idx) => {
        console.log(`   [${idx + 1}] ${s.name} - ${s.title}`);
        console.log(`       🔗 URL: ${s.url ? s.url.substring(0, 80) + '...' : 'NONE'}`);
    });

    // 6. Test Cài đặt ưu tiên Server (Filter test)
    console.log("\n⚙️ 6. Test Lọc Server với Cài đặt: chỉ lấy Vietsub...");
    globalThis.SCRAPER_SETTINGS = { preferredServer: "vietsub" };
    const filteredStreams = await getStreams("1396", "tv", 1, 1);
    console.log(`✅ Kết quả sau khi lọc: ${filteredStreams.length} luồng (Kỳ vọng: chỉ có Vietsub)`);
    filteredStreams.forEach((s, idx) => {
        console.log(`   [${idx + 1}] ${s.name} - ${s.title}`);
    });
    globalThis.SCRAPER_SETTINGS = {};

    console.log("\n=================================================");
    console.log("🎉 TẤT CẢ CÁC BÀI KIỂM THỬ VSMOV ĐÃ HOÀN TẤT!");
    console.log("=================================================");
}

runTests().catch(err => {
    console.error("❌ Kiểm thử thất bại:", err);
    process.exit(1);
});
