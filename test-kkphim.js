// test-kkphim.js - Script kiểm thử Provider KKPhim cho Nuvio (Direct M3U8 Native)
const { getStreams, onSettings, cleanIdPrefix, toSlug } = require('./providers/kkphim.js');

async function runTests() {
    console.log("=================================================");
    console.log("🧪 BẮT ĐẦU KIỂM THỬ NUVIO PROVIDER: KKPHIM (DIRECT M3U8)");
    console.log("=================================================\n");

    // 0. Kiểm tra hàm cleanIdPrefix & toSlug
    console.log("🧹 0. Kiểm tra làm sạch ID tiền tố...");
    console.log("   tmdb:76600 ->", cleanIdPrefix("tmdb:76600"));
    console.log("   imdb:tt1630029 ->", cleanIdPrefix("imdb:tt1630029"));
    console.log("   jkkphim_avatar-2 ->", cleanIdPrefix("jkkphim_avatar-2"));

    // 1. Kiểm tra Settings Schema
    console.log("\n⚙️ 1. Kiểm tra Schema Cài đặt (onSettings)...");
    const settings = await onSettings();
    console.log(`✅ onSettings trả về ${settings.length} mục cấu hình.`);
    settings.forEach(s => console.log(`   - [${s.type}] ${s.label || s.key}`));

    // 2. Test Phim Lẻ: Avatar 2 (Fast Path qua TMDB: 76600)
    console.log("\n🎬 2. Test Phim Lẻ: Avatar 2 (Nuvio ID: tmdb:76600)...");
    const streamsAvatar = await getStreams("tmdb:76600", "movie", null, null);
    console.log(`✅ Kết quả: ${streamsAvatar.length} luồng phát.`);
    streamsAvatar.forEach((s, idx) => {
        console.log(`   [${idx + 1}] ${s.name} - ${s.title}`);
        console.log(`       🔗 URL: ${s.url ? s.url.substring(0, 80) + '...' : 'NONE'}`);
        console.log(`       💎 Format: ${s.type || s.quality} | Provider: ${s.provider}`);
        console.log(`       📎 Headers: Referer=${s.headers?.Referer}`);
    });

    // 3. Test Phim Lẻ: Avatar 2 qua IMDb ID (tt1630029)
    console.log("\n🎬 3. Test Phim Lẻ: Avatar 2 qua IMDb ID (imdb:tt1630029)...");
    const streamsAvatarImdb = await getStreams("imdb:tt1630029", "movie", null, null);
    console.log(`✅ Kết quả: ${streamsAvatarImdb.length} luồng phát.`);
    streamsAvatarImdb.forEach((s, idx) => {
        console.log(`   [${idx + 1}] ${s.name} - ${s.title}`);
        console.log(`       🔗 URL: ${s.url ? s.url.substring(0, 80) + '...' : 'NONE'}`);
    });

    // 4. Test Phim Lẻ: Oppenheimer (TMDB ID: 872585 - Search & Match Path)
    console.log("\n🎬 4. Test Phim Lẻ: Oppenheimer (TMDB ID: 872585)...");
    const streamsOpp = await getStreams("872585", "movie", null, null);
    console.log(`✅ Kết quả: ${streamsOpp.length} luồng phát.`);
    streamsOpp.forEach((s, idx) => {
        console.log(`   [${idx + 1}] ${s.name} - ${s.title}`);
        console.log(`       🔗 URL: ${s.url ? s.url.substring(0, 80) + '...' : 'NONE'}`);
    });

    // 5. Test Phim Bộ: Breaking Bad Season 1 Episode 1 (TMDB ID: 1396)
    console.log("\n📺 5. Test Phim Bộ: Breaking Bad S01E01 (TMDB ID: 1396)...");
    const streamsBB = await getStreams("1396", "tv", 1, 1);
    console.log(`✅ Kết quả: ${streamsBB.length} luồng phát.`);
    streamsBB.forEach((s, idx) => {
        console.log(`   [${idx + 1}] ${s.name} - ${s.title}`);
        console.log(`       🔗 URL: ${s.url ? s.url.substring(0, 80) + '...' : 'NONE'}`);
    });

    // 6. Test Phim Bộ: Stranger Things Season 4 Episode 1 (TMDB ID: 66732)
    console.log("\n📺 6. Test Phim Bộ: Stranger Things S04E01 (TMDB ID: 66732)...");
    const streamsST = await getStreams("66732", "tv", 4, 1);
    console.log(`✅ Kết quả: ${streamsST.length} luồng phát.`);
    streamsST.forEach((s, idx) => {
        console.log(`   [${idx + 1}] ${s.name} - ${s.title}`);
        console.log(`       🔗 URL: ${s.url ? s.url.substring(0, 80) + '...' : 'NONE'}`);
    });

    // 7. Test Cài đặt ưu tiên Server (Filter test)
    console.log("\n⚙️ 7. Test Lọc Server với Cài đặt: chỉ lấy Vietsub...");
    globalThis.SCRAPER_SETTINGS = { preferredServer: "vietsub" };
    const filteredStreams = await getStreams("tmdb:76600", "movie", null, null);
    console.log(`✅ Kết quả sau khi lọc: ${filteredStreams.length} luồng (Kỳ vọng: chỉ có Vietsub)`);
    filteredStreams.forEach((s, idx) => {
        console.log(`   [${idx + 1}] ${s.name} - ${s.title}`);
    });
    globalThis.SCRAPER_SETTINGS = {};

    console.log("\n=================================================");
    console.log("🎉 TẤT CẢ CÁC BÀI KIỂM THỬ KKPHIM ĐÃ HOÀN TẤT!");
    console.log("=================================================");
}

runTests().catch(err => {
    console.error("❌ Kiểm thử thất bại:", err);
    process.exit(1);
});
