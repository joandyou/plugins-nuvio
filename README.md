# Nuvio Vietnamese Plugins (All-in-One Nuvio Repository)

Kho Plugin Nuvio nguồn phim Việt Nam chuẩn cấu trúc [All-in-One Nuvio](https://raw.githubusercontent.com/D3adlyRocket/All-in-One-Nuvio/refs/heads/main/manifest.json).

Hoạt động **100% tại Client (Zero Proxy)**, giải mã và trích xuất luồng phát HLS native trực tiếp tại thiết bị người dùng, tương thích hoàn toàn với ExoPlayer / MPV trên Nuvio Mobile & TV.

---

## ⚡ Tối ưu tốc độ: Direct Provider Search First (Tên phim + Năm)

Trước đây, việc tra cứu luồng phải đi qua API TMDB quốc tế (`api.themoviedb.org`) để lấy metadata trước khi tìm kiếm ở Provider. Điều này gây trễ lớn (1-3s) và dễ lỗi nếu TMDB bị chặn hoặc chậm.

**Cơ chế tối ưu mới (Direct Search First):**
1. **Ưu tiên 1 (Direct Search)**: Tận dụng trực tiếp endpoint tìm kiếm của từng Provider bằng **Tên phim + Năm** được Nuvio truyền sẵn qua `meta`:
   - **KKPhim**: `https://phimapi.com/v1/api/tim-kiem?keyword={keyword}&limit=10`
   - **NguonC**: `https://phim.nguonc.com/api/films/search?keyword={keyword}&page=1`
   - **VSMov**: `https://vsmov.com/api/tim-kiem?keyword={keyword}&limit=20&page=1`
   $\rightarrow$ **Tốc độ phản hồi cực nhanh (150ms - 800ms)**, hoàn toàn không đụng đến TMDB API.
2. **Dự phòng (TMDB Fallback)**: Chỉ kích hoạt gọi TMDB khi `meta` không có tên phim hoặc tìm kiếm trực tiếp không ra kết quả phù hợp.

---

## ⚠️ Lưu ý quan trọng về Kiến trúc Nuvio (Plugins vs Addons)

Nhiều bạn thắc mắc: *"Tại sao add link plugin vào Nuvio rồi mà màn hình chính không thấy danh mục/catalog phim?"*

Trong kiến trúc của **Nuvio**:
1. **Plugins (Local Scrapers):**
   - Được thêm tại: **Settings $\rightarrow$ Local Scrapers / Plugins**.
   - **Nhiệm vụ:** Chỉ thực thi hàm `getStreams(tmdbId, mediaType, season, episode, meta)` để cào link phát (`.m3u8`) khi bạn **bấm vào xem một bộ phim cụ thể**.
   - **Local Scrapers KHÔNG tạo Catalog (danh mục phim trang chủ)**.
2. **Addons (Stremio Addons):**
   - Được thêm tại: **Settings $\rightarrow$ Content & Discovery $\rightarrow$ Add-ons**.
   - **Nhiệm vụ:** Cung cấp Catalog (hàng phim Mới cập nhật, Phim lẻ, Phim bộ, Thể loại...) hiển thị ngoài màn hình chính (Home Screen).

---

## 🚀 Hướng dẫn thêm Plugin vào Nuvio

1. Mở ứng dụng **Nuvio** (trên Android, Android TV, iOS, Windows, macOS).
2. Vào **Settings** (Cài đặt) $\rightarrow$ **Plugins** (hoặc **Local Scrapers**) $\rightarrow$ **Add Repository**.
3. Dán link file `manifest.json`:
   ```text
   https://jstremio.joandyou.cc/plugins/plugins-nuvio/manifest.json
   ```
4. Bật các Provider mong muốn:
   - **Phim NguonC**: Kho phim NguonC phong phú (Vietsub / Thuyết minh), bóc tách StreamC bootstrap trực tiếp tại Client.
   - **Phim KKPhim**: Kho phim KKPhim tốc độ cao (Vietsub / Thuyết minh / Lồng tiếng), luồng m3u8 HLS có sẵn trực tiếp từ API.
   - **Phim VSMov**: Kho phim VSMov chất lượng cao (Vietsub / Thuyết minh / Lồng tiếng), luồng m3u8 native kèm tự động phân giải phụ đề WebVTT.
5. Bây giờ, khi bạn mở bất kỳ phim nào trong Nuvio (từ Cinemeta, TMDB hoặc Addon), Nuvio sẽ tự động gọi Scrapers để lấy luồng xem phim native.

---

## 📁 Cấu trúc kho Repository

```text
plugins-nuvio/
├── manifest.json         # File đăng ký Provider theo chuẩn Nuvio Scrapers
├── providers/
│   ├── nguonc.js         # Provider NguonC (StreamC Direct HLS Client Extractor)
│   ├── kkphim.js         # Provider KKPhim (phimapi.com Direct M3U8 Native Extractor)
│   └── vsmov.js          # Provider VSMov (vsmov.com Direct M3U8 & WebVTT Extractor)
├── test-direct-search.js # Script benchmark Direct Search First (Tên phim + Năm)
├── test-nguonc.js        # Script kiểm thử NguonC với Node.js
├── test-kkphim.js        # Script kiểm thử KKPhim với Node.js
├── test-vsmov.js         # Script kiểm thử VSMov với Node.js
└── README.md
```

---

## 🧠 Cơ chế hoạt động của các Provider

### 1. Phim KKPhim (`providers/kkphim.js`)
- **Direct M3U8 Native**: KKPhim cung cấp sẵn link m3u8 HLS chuẩn trong API `phimapi.com`.
- **Direct Search First**: Tìm kiếm trực tiếp bằng tên phim + năm qua endpoint `/v1/api/tim-kiem` cho phản hồi tức thì.
- **Fast TMDB Direct Match**: Với phim có mã TMDB, plugin hỗ trợ gọi endpoint `/tmdb/{type}/{id}` để lấy luồng trực tiếp.

### 2. Phim VSMov (`providers/vsmov.js`)
- **Direct M3U8 Native**: Chuyển đổi trực tiếp link player embed (`/video/` $\rightarrow$ `/stream/` + `/master.m3u8`) thành luồng HLS phát native mượt mà.
- **Tự động trích xuất phụ đề (WebVTT)**: Tự động bóc tách danh sách track subtitle trong embed HTML sang định dạng subtitle native của Nuvio.
- **Direct Search First & TMDB ID Mapping**: Tìm kiếm trực tiếp qua `/api/tim-kiem?limit=20&page=1`, đối chiếu mã TMDB chuẩn lưu sẵn trong VSMov.

### 3. Phim NguonC (`providers/nguonc.js`)
- **Direct Search First**: Tìm kiếm trực tiếp qua `/api/films/search?page=1` trước khi xét đến TMDB.
- **Zero-Proxy StreamC Extractor**: Gọi bootstrap nội bộ tại Client để lấy trực tiếp URL playlist HLS unencrypted từ `embed.streamc.xyz`.
- **ExoPlayer Native Compatibility**: Không phát qua iframe/web embed, đảm bảo không bị giật lag hay văng app.

---

## 🧪 Kiểm thử cục bộ

```bash
# Kiểm thử tốc độ Direct Search First
node test-direct-search.js

# Kiểm thử từng Provider
node test-kkphim.js
node test-vsmov.js
node test-nguonc.js
```
