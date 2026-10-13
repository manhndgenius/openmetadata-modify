# BÁO CÁO TỔNG HỢP TOÀN BỘ QUÁ TRÌNH THỰC HIỆN DỰ ÁN
**Dự án:** Tích hợp Data Quality Rule Recommender vào OpenMetadata  
**Repository:** [https://github.com/manhndgenius/openmetadata-modify](https://github.com/manhndgenius/openmetadata-modify)  
**Thời gian cập nhật:** 13/10/2026  

---

## 📌 MỤC LỤC
1. [Khởi tạo môi trường & Xử lý lỗi nền tảng](#1-khởi-tạo-môi-trường--xử-lý-lỗi-nền-tảng)
2. [Chiến lược tích hợp kiến trúc (Phương án 2 - Giai đoạn 1)](#2-chiến-lược-tích-hợp-kiến-trúc)
3. [Xây dựng phân hệ Data Quality Rule Recommender](#3-xây-dựng-phân-hệ-data-quality-rule-recommender)
4. [Tối ưu hóa UI/UX & Đồng bộ nhận diện OpenMetadata](#4-tối-ưu-hóa-uiux--đồng-bộ-nhận-diện-openmetadata)
5. [Tích hợp chiều sâu: Publish trực tiếp vào OpenMetadata Test Cases](#5-tích-hợp-chiều-sâu-publish-trực-tiếp-vào-openmetadata-test-cases)
6. [Quản trị mã nguồn & Đẩy lên GitHub Repository](#6-quản-trị-mã-nguồn--đẩy-lên-github-repository)
7. [Bảng danh mục các file đã chỉnh sửa & tạo mới](#7-bảng-danh-mục-các-file-đã-chỉnh-sửa--tạo-mới)

---

## 1. Khởi tạo môi trường & Xử lý lỗi nền tảng

### 1.1. Khởi động hạ tầng Docker
- Kiểm tra và khởi chạy cụm dịch vụ OpenMetadata backend thông qua Docker Compose:
  - `openmetadata_server` (Port 8585 - REST API / Dropwizard server).
  - `openmetadata_mysql` (Port 3306 - Metadata Storage).
  - `openmetadata_elasticsearch` (Port 9200 - Search & Indexing Engine).

### 1.2. Sửa lỗi build tương thích môi trường Windows
- File `openmetadata-ui/src/main/resources/ui/parseSchemas.js` gặp lỗi cú pháp đường dẫn và khóa file trên Windows (`EPERM: operation not permitted, unlink`).
- **Giải pháp:**
  - Chuẩn hóa việc ghép đường dẫn bằng `path.resolve` và `path.relative`.
  - Khôi phục thư mục làm việc gốc bằng `process.chdir(cwd)` trước khi xóa thư mục tạm.
  - Bọc khối `try...catch` an toàn khi dọn dẹp thư mục tạm trên Windows.
- Khởi động thành công máy chủ phát triển Vite Frontend tại `http://localhost:3000`.

---

## 2. Chiến lược tích hợp kiến trúc

Dựa trên yêu cầu tích hợp module từ repository [dq-rule-recommender-openmetadata](https://github.com/manhndgenius/dq-rule-recommender-openmetadata) và tài liệu `DANH_SACH_API_FE_CHO_MEMBER_B.md`, 2 phương án đã được đưa ra phân tích:

* **Phương án 1:** Gắn trực tiếp vào từng tab của Table Details.
* **Phương án 2:** Xây dựng trang quản trị trung tâm chuyên biệt trong phân hệ Observability (Giai đoạn 1), sau đó liên kết hai chiều với Data Quality của từng Table (Giai đoạn 2).
* **Quyết định:** Chọn **Phương án 2 (Triển khai Giai đoạn 1)**: Xây dựng một trang quản trị trung tâm riêng biệt đặt dưới danh mục **Observability** trên thanh điều hướng bên trái, đồng thời kết nối chặt chẽ với tab Data Quality của từng Table.

---

## 3. Xây dựng phân hệ Data Quality Rule Recommender

### 3.1. Đăng ký Route & Điều hướng hệ thống
- **Định tuyến:** Khai báo route mới `ROUTES.RULE_RECOMMENDER = '/rule-recommender'` trong `constants.ts` và đăng ký component trong `AuthenticatedAppRouter.tsx`.
- **Thanh menu bên trái (Left Sidebar):**
  - Khai báo enum `RULE_RECOMMENDER = 'rule-recommender'` trong `sidebar.enum.ts`.
  - Bổ sung mục điều hướng dưới nhóm `OBSERVABILITY` trong `LeftSidebar.constants.ts`.
  - Bổ sung khóa ngôn ngữ `"rule-recommender": "Rule Recommender"` trong `en-us.json`.

### 3.2. Xây dựng Service API Layer
Tạo mới file `openmetadata-ui/src/main/resources/ui/src/services/ruleRecommenderAPI.ts` đảm nhận:
- Kết nối tới backend FastAPI (`http://localhost:8000/api/v1`) với các endpoint: `/health`, `/rules`, `/rules/recommend`, `/rules/review`, `/rules/publish`, `/rules/cleanup-duplicates`, `/evaluation/golden`.
- Truy vấn danh sách Table trực tiếp từ OpenMetadata Search Index (`/api/v1/search/query`).
- **Cơ chế Fallback thông minh:** Khi backend Python offline, hệ thống tự động sinh dữ liệu đề xuất quy tắc chất lượng dữ liệu chất lượng cao dựa trên bảng và cột thực tế (hỗ trợ các bảng `customers`, `orders`, `products` và các bảng dữ liệu bất kỳ).

### 3.3. Xây dựng trang giao diện (RuleRecommenderPage)
Tạo mới `RuleRecommenderPage.tsx` và `rule-recommender.style.less`:
- **Khối thông tin & Trạng thái:** Hiển thị trạng thái kết nối backend (Connected / Offline Mock Mode).
- **Thẻ KPI Metrics:** Thống kê trực quan:
  - Total Recommended
  - Pending Review
  - Accepted
  - Rejected
  - Average Confidence Score (%)
- **Thanh chọn Table (Target Data Asset):** Dropdown tìm kiếm và chọn bảng dữ liệu kèm thông tin Database, Schema, số lượng cột, mô tả.
- **Bảng duyệt quy tắc (Candidate Rules):**
  - Cột Rule Type & Scope (Table level hoặc Column level).
  - Thanh tiến trình độ tin cậy (Confidence score progress bar).
  - Cột Logic / Parameters / Biểu thức SQL.
  - Cột Rationale (Lý do mô hình gợi ý rule).
  - Nút hành động: Duyệt (Accept), Từ chối (Reject), Sửa tham số (Edit parameters modal).
- **Bộ lọc & Tìm kiếm:** Lọc theo trạng thái (All/Pending/Accepted/Rejected), lọc theo Scope (Table/Column), tìm kiếm full-text theo tên cột hoặc quy tắc.
- **Duyệt hàng loạt (Batch Review):** Nút *Accept All Pending* cho phép duyệt nhanh toàn bộ rule đang chờ.
- **Đánh giá Benchmark:** Tab xem báo cáo đánh giá Golden Dataset (Precision 84.5%, Recall 90.7%, F1-Score 87.5%).

---

## 4. Tối ưu hóa UI/UX & Đồng bộ nhận diện OpenMetadata

Dựa trên phản hồi người dùng, giao diện đã được tinh gọn và đồng bộ:
1. **Màu nền Card Header:** Chuyển đổi nền gradient sang nền trắng `#ffffff` phẳng, đồng bộ hoàn toàn với tông màu chung của các trang trong OpenMetadata.
2. **Lược bỏ biểu tượng thừa:**
   - Xóa bỏ icon tên lửa (rocket), icon nút chạy (play), icon upload.
   - Xóa bỏ huy hiệu phiên bản `AI Powered v1.0`.
   - Giữ lại duy nhất icon cấu hình `<SettingOutlined />` để mở modal tùy biến Endpoint API.
3. **Đổi tên nút bấm hành động:**
   - Đổi tên từ `Publish to OpenMetadata ({count})` thành **`Publish ({count})`** (hoặc `Publish` khi chưa duyệt rule nào).

---

## 5. Tích hợp chiều sâu: Publish trực tiếp vào OpenMetadata Test Cases

### 5.1. Vấn đề trước đây
Trước đó, nút Publish chỉ gọi sang endpoint API bên ngoài mà chưa ghi vào cơ sở dữ liệu của OpenMetadata, khiến người dùng vào bảng không thấy rule xuất hiện.

### 5.2. Giải pháp tích hợp trực tiếp
Nâng cấp hàm `publishRules` trong `ruleRecommenderAPI.ts`:
- Khi người dùng bấm **Publish**, hệ thống duyệt qua danh sách các rule đã **Accepted** và chuyển đổi thành payload `CreateTestCase` chuẩn:
  - Tự động map loại rule sang OpenMetadata Test Definition:
    - `columnValuesToBeNotNull`
    - `columnValuesToBeUnique`
    - `columnValuesToBeBetween`
    - `columnValueLengthsToBeBetween`
    - `columnValuesToBeInSet`
    - `tableRowCountToBeBetween`
    - `tableCustomSQLQuery`
  - Sinh `entityLink` chính xác:
    - Cấp cột: `<#E::table::<tableFqn>::columns::<columnName>>`
    - Cấp bảng: `<#E::table::<tableFqn>>`
  - Chuẩn hóa tham số `parameterValues` (`minValue`, `maxValue`, `sqlExpression`, `allowedValues`...).
- Gửi trực tiếp qua `axiosClient.put('/dataQuality/testCases', payload)` sử dụng phiên đăng nhập và token hiện tại của người dùng.
- OpenMetadata tự động liên kết các test case này vào **Test Suite** tương ứng của Table (`<tableFqn>.testSuite`).

### 5.3. Trải nghiệm xem Rule trong Table
Bổ sung các điểm kết nối giúp người dùng kiểm tra ngay kết quả:
- **Thông báo thành công:** Popup chứa nút bấm màu xanh **`Xem trong Bảng ({Tên bảng})`** chuyển hướng người dùng ngay lập tức tới tab Profiler & Data Quality (`/table/:tableFqn/profiler/data-quality`).
- **Liên kết tiện lợi trên card chọn bảng:** Nút bấm **`Xem Data Quality của bảng ({Tên bảng})`** nằm ngay bên dưới ô chọn bảng để mở xem bất kỳ lúc nào.

---

## 6. Quản trị mã nguồn & Đẩy lên GitHub Repository

### 6.1. Xử lý giới hạn Shallow Clone
- Repository cục bộ ban đầu được clone dạng shallow (`git rev-parse --is-shallow-repository` = `true`), chỉ có 1 commit lịch sử gần nhất.
- Khi đẩy lên một repository rỗng mới trên GitHub, máy chủ GitHub từ chối do thiếu các commit/blob tổ tiên.
- **Giải pháp:** Tạo một commit gốc hoàn chỉnh (root orphan commit) chứa **100% toàn bộ source code của toàn dự án OpenMetadata** cùng tất cả các tính năng đã phát triển.

### 6.2. Cấu hình Remote & Đẩy code
- Cấu hình remote `origin` trỏ về repository của bạn:
  ```bash
  origin   https://github.com/manhndgenius/openmetadata-modify.git (fetch/push)
  upstream https://github.com/open-metadata/OpenMetadata.git (fetch/push)
  ```
- Đẩy thành công toàn bộ mã nguồn lên nhánh **`main`**.
- Xóa nhánh phụ `1.12.6` ở cả máy cục bộ và GitHub theo yêu cầu, giữ duy nhất nhánh **`main`** làm nhánh mặc định sạch sẽ.

---

## 7. Bảng danh mục các file đã chỉnh sửa & tạo mới

| STT | Đường dẫn file | Thao tác | Mô tả nội dung |
| :---: | :--- | :---: | :--- |
| 1 | `openmetadata-ui/.../services/ruleRecommenderAPI.ts` | **Tạo mới** | API service kết nối Recommender Backend & sync OpenMetadata Test Cases |
| 2 | `openmetadata-ui/.../pages/RuleRecommenderPage/RuleRecommenderPage.tsx` | **Tạo mới** | Component giao diện chính quản lý đề xuất, duyệt & publish rule |
| 3 | `openmetadata-ui/.../pages/RuleRecommenderPage/rule-recommender.style.less` | **Tạo mới** | Tùy biến CSS/LESS cho trang Rule Recommender |
| 4 | `openmetadata-ui/.../components/AppRouter/AuthenticatedAppRouter.tsx` | **Chỉnh sửa** | Đăng ký route `/rule-recommender` vào hệ thống định tuyến |
| 5 | `openmetadata-ui/.../constants/constants.ts` | **Chỉnh sửa** | Định nghĩa hằng số route `ROUTES.RULE_RECOMMENDER` |
| 6 | `openmetadata-ui/.../constants/LeftSidebar.constants.ts` | **Chỉnh sửa** | Bổ sung menu Rule Recommender vào nhóm Observability |
| 7 | `openmetadata-ui/.../enums/sidebar.enum.ts` | **Chỉnh sửa** | Khai báo enum menu item `RULE_RECOMMENDER` |
| 8 | `openmetadata-ui/.../locale/languages/en-us.json` | **Chỉnh sửa** | Thêm nhãn dịch đa ngôn ngữ cho menu |
| 9 | `openmetadata-ui/parseSchemas.js` | **Chỉnh sửa** | Sửa lỗi tương thích đường dẫn và xóa file tạm trên Windows |

---

## 🎯 KẾT QUẢ ĐẠT ĐƯỢC
- ✅ Toàn bộ mã nguồn chạy ổn định trên môi trường Windows (`Vite Dev Server :3000` + `OpenMetadata Server :8585`).
- ✅ Giao diện **Data Quality Rule Recommender** hoạt động mượt mà, chuẩn UI OpenMetadata.
- ✅ Khi duyệt rule và bấm **Publish**, rule được ghi trực tiếp thành **OpenMetadata Test Case** và xem được ngay tại tab **Profiler & Data Quality** của bảng.
- ✅ Toàn bộ dự án đã được đẩy lên GitHub tại **[https://github.com/manhndgenius/openmetadata-modify](https://github.com/manhndgenius/openmetadata-modify)** (nhánh `main`).
