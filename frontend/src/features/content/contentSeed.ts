import type {
  ContentArticle,
  ContentHome,
  ContentKpiSummary,
  ContentMetric,
  ContentSource,
  ContentStatistics,
  RealProject,
  TrustGrade,
} from "../../types";

const NOW = "2026-07-09T00:00:00.000Z";

export const contentSources: ContentSource[] = [
  {
    id: "source-bocongan",
    name: "Bộ Công an",
    url: "https://mps.gov.vn/",
    level: "A",
    kind: "GOVERNMENT",
    description: "Nguồn cấp A cho cảnh báo thủ đoạn, vụ việc đã xử lý và khuyến cáo phòng tránh lừa đảo.",
  },
  {
    id: "source-chinhphu",
    name: "Báo điện tử Chính phủ",
    url: "https://chinhphu.vn/",
    level: "A",
    kind: "GOVERNMENT",
    description: "Nguồn cấp A cho thông tin chính sách, cảnh báo và số liệu công bố chính thức.",
  },
  {
    id: "source-nhandan",
    name: "Báo Nhân Dân",
    url: "https://nhandan.vn/",
    level: "B",
    kind: "PRESS",
    description: "Báo chí chính thống; dùng để đối chiếu vụ việc và cảnh báo có nguồn biên tập.",
  },
  {
    id: "source-vtv24",
    name: "VTV/VTV24",
    url: "https://vtv.vn/",
    level: "B",
    kind: "VIDEO",
    description: "Nguồn video/bản tin chính thống cho nội dung cảnh báo và giáo dục phòng tránh.",
  },
  {
    id: "source-nuoiem",
    name: "Nuôi Em",
    url: "https://www.nuoiem.com/",
    level: "C",
    kind: "OFFICIAL_ORG",
    description: "Nguồn tự công bố của dự án Nuôi Em về chi phí, mục tiêu và quy trình nhận mã.",
  },
  {
    id: "source-tuthienthat",
    name: "Từ Thiện Thật",
    url: "https://tuthienthat.vn/",
    level: "C",
    kind: "OFFICIAL_ORG",
    description: "Nguồn tự công bố về sao kê, hoàn cảnh, video và báo cáo chi tiêu của tổ chức.",
  },
  {
    id: "source-redcross",
    name: "Hội Chữ thập đỏ Việt Nam",
    url: "https://redcross.org.vn/",
    level: "A",
    kind: "OFFICIAL_ORG",
    description: "Tổ chức nhân đạo chính thức; dùng cho chiến dịch vận động, cứu trợ và cảnh báo giả mạo.",
  },
  {
    id: "source-unicef",
    name: "UNICEF Việt Nam",
    url: "https://www.unicef.org/vietnam/",
    level: "A",
    kind: "OFFICIAL_ORG",
    description: "Nguồn quốc tế/chính thức về trẻ em, dinh dưỡng, giáo dục và bảo vệ trẻ em tại Việt Nam.",
  },
  {
    id: "source-saigonchildren",
    name: "saigonchildren",
    url: "https://www.saigonchildren.com/",
    level: "C",
    kind: "OFFICIAL_ORG",
    description: "Nguồn tự công bố của tổ chức giáo dục phi lợi nhuận hỗ trợ trẻ em tại Việt Nam.",
  },
];

const byId = Object.fromEntries(contentSources.map((source) => [source.id, source] as const));

function score(
  total: number,
  grade: TrustGrade,
  sourceAuthority: number,
  financialEvidence: number,
  legalIdentity: number,
  mediaEvidence: number,
  freshness: number,
  reasons: string[],
) {
  return {
    total,
    grade,
    source_authority: sourceAuthority,
    financial_evidence: financialEvidence,
    legal_identity: legalIdentity,
    media_evidence: mediaEvidence,
    freshness,
    reasons,
  };
}

export const contentArticles: ContentArticle[] = [
  {
    id: "article-nuoiem-model",
    slug: "nuoi-em-mo-hinh-nhan-ma-va-chi-phi-nam-hoc",
    type: "ORGANIZATION",
    title: "Nuôi Em: chi phí năm học, mục tiêu nhận nuôi và cách kiểm tra nguồn",
    excerpt: "Nuôi Em công bố mức tham chiếu 1.450.000đ/năm học và mục tiêu 120.000+ trẻ được nhận nuôi trong mùa 2025-2026.",
    summary:
      "CharityConnect lưu Nuôi Em như một nguồn tự công bố cấp C: có website chính thức, có số liệu chi phí và mục tiêu, nhưng người quyên góp vẫn nên đối chiếu sao kê, kênh nhận tiền và cập nhật từ tổ chức trước khi chuyển khoản.",
    body: [
      "Nuôi Em là ví dụ tốt để kiểm tra một dự án có thật: có website riêng, mô tả quy trình nhận mã, mức đóng góp theo năm học và thông tin hỗ trợ bổ sung như bữa ăn, cơ sở vật chất, điểm trường.",
      "Dữ liệu được hiển thị trên CharityConnect chỉ là tóm tắt và claim có nguồn. Hệ thống không copy nguyên nội dung từ website gốc, không tự xác nhận kiểm toán độc lập và luôn gắn nhãn “theo nguồn công bố”.",
      "Khi ra quyết định quyên góp, người dùng nên kiểm tra lại kênh chính thức, tên chủ tài khoản nhận tiền, báo cáo tài chính hoặc sao kê và lịch cập nhật hình ảnh/video theo từng đợt.",
    ],
    source: byId["source-nuoiem"],
    source_url: "https://www.nuoiem.com/",
    source_title: "Nuôi Em",
    source_published_at: "2025-2026",
    collected_at: NOW,
    updated_at: NOW,
    image_url: "/images/education.jpg",
    tags: ["dự án thật", "trẻ em vùng cao", "giáo dục", "nguồn tự công bố"],
    badges: ["Dự án thật", "Có số liệu", "Nguồn tự công bố"],
    claims: [
      { label: "Chi phí tham chiếu", value: "1.450.000 VND/năm học", note: "Theo công bố của Nuôi Em cho năm học 2025-2026." },
      { label: "Mục tiêu công bố", value: "120.000+ trẻ", note: "Mục tiêu nhận nuôi trên cả nước theo website Nuôi Em." },
    ],
    media: [{ type: "IMAGE", url: "/images/education.jpg", title: "Hỗ trợ bữa ăn và giáo dục vùng cao", attribution: "Ảnh minh họa CharityConnect" }],
    score: score(82, "B", 20, 22, 16, 15, 9, ["Có website chính thức", "Có số liệu chi phí/mục tiêu", "Cần đối chiếu thêm nguồn độc lập khi quyên góp lớn"]),
    status: "PUBLISHED",
  },
  {
    id: "article-tuthienthat-financial-report",
    slug: "tu-thien-that-sao-ke-tai-chinh-va-so-du-cong-khai",
    type: "FINANCIAL_REPORT",
    title: "Từ Thiện Thật: sao kê tài chính công khai và chỉ số thu/chi",
    excerpt: "Trang sao kê của Từ Thiện Thật công bố tổng thu, tổng chi và số dư tài khoản để người ủng hộ đối chiếu.",
    summary:
      "CharityConnect xếp Từ Thiện Thật là nguồn tự công bố cấp C. Điểm cộng là có trang sao kê và số liệu tài chính; điểm cần kiểm tra là tính cập nhật, chứng từ chi và kênh xác nhận độc lập.",
    body: [
      "Trang sao kê giúp người ủng hộ không chỉ nhìn thấy lời kêu gọi mà còn xem được dòng tiền đã vào, đã chi và còn lại. Đây là dạng bằng chứng tài chính quan trọng trong mô hình Verify + Donate.",
      "Khi ingest dữ liệu từ nguồn này, hệ thống chỉ lưu tiêu đề, tóm tắt tự viết, claim số liệu và URL nguồn; nội dung chi tiết vẫn phải đọc tại website gốc.",
      "Nguồn tự công bố không đồng nghĩa với kiểm toán độc lập. Vì vậy giao diện luôn cảnh báo người dùng nên kiểm tra chứng từ, ngày cập nhật và đối chiếu tài khoản nhận tiền.",
    ],
    source: byId["source-tuthienthat"],
    source_url: "https://tuthienthat.vn/sao-ke-tai-chinh/",
    source_title: "Từ Thiện Thật - Sao kê tài chính",
    source_published_at: "2026",
    collected_at: NOW,
    updated_at: NOW,
    image_url: "/images/community.jpg",
    tags: ["sao kê", "tài chính", "nguồn tự công bố"],
    badges: ["Có sao kê", "Có số liệu", "Nguồn tự công bố"],
    claims: [
      { label: "Tổng thu công bố", value: "1.100.881.002 VND", note: "Số liệu lấy từ trang sao kê công khai tại thời điểm thu thập." },
      { label: "Số dư công bố", value: "965.161.002 VND", note: "Cần đối chiếu ngày cập nhật trên nguồn gốc." },
    ],
    media: [{ type: "IMAGE", url: "/images/community.jpg", title: "Minh bạch tài chính trong hoạt động từ thiện", attribution: "Ảnh minh họa CharityConnect" }],
    score: score(78, "B", 20, 25, 14, 10, 9, ["Có trang sao kê", "Có số liệu thu/số dư", "Nguồn tự công bố nên cần đối chiếu chứng từ"]),
    status: "PUBLISHED",
  },
  {
    id: "article-redcross-cuba",
    slug: "hoi-chu-thap-do-ung-ho-nhan-dan-cuba-gan-292-ty",
    type: "REAL_PROJECT",
    title: "Hội Chữ thập đỏ Việt Nam: ủng hộ nhân dân Cuba gần 292 tỷ đồng",
    excerpt: "Chiến dịch công bố 291,8 tỷ đồng và hơn 1,48 triệu lượt tham gia tính đến 17/08/2025.",
    summary:
      "Đây là nguồn cấp A vì dữ liệu đến từ Hội Chữ thập đỏ Việt Nam. CharityConnect dùng chiến dịch này làm ví dụ dự án thật có số tiền, lượt tham gia, thời gian vận động và đường dẫn cập nhật.",
    body: [
      "Bài công bố của Hội Chữ thập đỏ Việt Nam nêu số tiền ủng hộ gửi đến nhân dân Cuba, số lượt người tham gia và thời gian triển khai chiến dịch.",
      "Dữ liệu được đưa vào dashboard KPI để minh họa cách tổng hợp claim có số liệu: tiền, lượt tham gia, nguồn, ngày công bố và độ tin cậy.",
      "Khi người dùng bấm “Nguồn gốc”, hệ thống đưa về bài gốc để đọc toàn bộ bối cảnh thay vì sao chép nội dung báo/website.",
    ],
    source: byId["source-redcross"],
    source_url: "https://redcross.org.vn/so-tien-ung-ho-nhan-dan-cuba-dat-gan-292-ty-dong.html",
    source_title: "Hội Chữ thập đỏ Việt Nam",
    source_published_at: "2025-08-17",
    collected_at: NOW,
    updated_at: NOW,
    image_url: "/images/veo-charity-01.jpg",
    tags: ["dự án thật", "cứu trợ", "Hội Chữ thập đỏ", "số liệu"],
    badges: ["Nguồn cấp A", "Có số tiền", "Có lượt tham gia"],
    claims: [
      { label: "Số tiền công bố", value: "291,8 tỷ VND", note: "Tính đến 8h00 ngày 17/08/2025 theo Hội Chữ thập đỏ Việt Nam." },
      { label: "Lượt tham gia", value: "Hơn 1,48 triệu lượt", note: "Số lượt người tham gia đóng góp theo bài công bố." },
    ],
    media: [{ type: "IMAGE", url: "/images/veo-charity-01.jpg", title: "Chiến dịch vận động nhân đạo", attribution: "Ảnh minh họa CharityConnect" }],
    score: score(92, "A", 30, 25, 20, 8, 9, ["Nguồn tổ chức chính thức cấp A", "Có số tiền và lượt tham gia", "Có ngày công bố rõ ràng"]),
    status: "PUBLISHED",
  },
  {
    id: "article-unicef-nutrition",
    slug: "unicef-viet-nam-so-lieu-dinh-duong-tre-em",
    type: "REAL_STATISTIC",
    title: "UNICEF Việt Nam: số liệu dinh dưỡng trẻ em và nhu cầu can thiệp",
    excerpt: "UNICEF nêu hơn 200.000 trẻ suy dinh dưỡng cấp tính nặng mỗi năm và 1,8 triệu trẻ dưới 5 tuổi thấp còi.",
    summary:
      "Đây là nguồn cấp A dùng làm bối cảnh cho các chiến dịch hỗ trợ trẻ em. Dữ liệu không phải một lời kêu gọi chuyển tiền cụ thể, mà là số liệu nền để đánh giá nhu cầu xã hội.",
    body: [
      "Các dự án về trẻ em cần số liệu nền đáng tin cậy. UNICEF Việt Nam cung cấp bối cảnh về suy dinh dưỡng, thấp còi và nhu cầu điều trị hàng năm.",
      "CharityConnect lưu các con số này như ContentMetric loại SOURCE_STATISTIC để dashboard có thể tính tổng claim, tỷ lệ nguồn chính thống và gắn link nguồn.",
      "Khi bot được hỏi về hỗ trợ trẻ em vùng cao hoặc dinh dưỡng, hệ thống ưu tiên trả lời bằng các claim này trước khi tìm kiếm web ngoài.",
    ],
    source: byId["source-unicef"],
    source_url: "https://www.unicef.org/vietnam/nutrition",
    source_title: "UNICEF Việt Nam - Nutrition",
    source_published_at: "2026",
    collected_at: NOW,
    updated_at: NOW,
    image_url: "/images/medical-support.jpg",
    tags: ["UNICEF", "trẻ em", "dinh dưỡng", "số liệu"],
    badges: ["Nguồn cấp A", "Số liệu nền", "Có mục tiêu can thiệp"],
    claims: [
      { label: "Suy dinh dưỡng cấp tính nặng", value: "Hơn 200.000 trẻ/năm", note: "Theo trang Nutrition của UNICEF Việt Nam." },
      { label: "Trẻ dưới 5 tuổi thấp còi", value: "1,8 triệu trẻ", note: "Theo trang Nutrition của UNICEF Việt Nam." },
    ],
    media: [{ type: "IMAGE", url: "/images/medical-support.jpg", title: "Bối cảnh sức khỏe và dinh dưỡng trẻ em", attribution: "Ảnh minh họa CharityConnect" }],
    score: score(94, "A", 30, 18, 20, 16, 10, ["Nguồn quốc tế chính thức", "Có số liệu định lượng", "Phù hợp làm bối cảnh chiến dịch"]),
    status: "PUBLISHED",
  },
  {
    id: "article-mps-charity-run",
    slug: "bo-cong-an-canh-bao-giai-chay-tu-thien-lua-dao",
    type: "SCAM_ALERT",
    title: "Bộ Công an cảnh báo giải chạy từ thiện có dấu hiệu lừa đảo",
    excerpt: "Các đối tượng tạo fanpage giả mạo, sao chép logo/hình ảnh tổ chức uy tín và kêu gọi chuyển tiền đăng ký qua đường dẫn giả.",
    summary:
      "Bài cảnh báo cấp A cho thấy lừa đảo từ thiện có thể núp dưới hình thức giải chạy, đạp xe hoặc chiến dịch gây quỹ online. Người dùng cần kiểm tra ban tổ chức, kênh nhận tiền và link chính thức.",
    body: [
      "Theo cảnh báo, các đối tượng tạo tài khoản mạng xã hội giả mạo hoặc sao chép toàn bộ nội dung của bệnh viện, quỹ uy tín; có trường hợp dùng cả dấu tích xanh để tạo lòng tin.",
      "Dấu hiệu rủi ro gồm: link đăng ký lạ, tài khoản nhận tiền không thuộc tổ chức, thiếu thông báo trên website chính thức và lời kêu gọi quá gấp.",
      "CharityConnect gắn nhãn cảnh báo để người dùng phòng tránh, không tự quy kết thêm ngoài nội dung nguồn công bố.",
    ],
    source: byId["source-bocongan"],
    source_url: "https://www.mps.gov.vn/bai-viet/canh-bao-cac-giai-chay-tu-thien-co-dau-hieu-lua-dao-tren-mang-xa-hoi-1757472719",
    source_title: "Cổng thông tin điện tử Bộ Công an",
    source_published_at: "2025-09-10",
    collected_at: NOW,
    updated_at: NOW,
    image_url: "/images/veo-charity-03.jpg",
    tags: ["cảnh báo", "giả mạo", "giải chạy từ thiện"],
    badges: ["Nguồn cấp A", "Cơ quan chức năng cảnh báo", "Không chuyển qua link lạ"],
    claims: [
      { label: "Thủ đoạn", value: "Fanpage/tài khoản giả mạo", note: "Sao chép logo, nội dung và hình ảnh của tổ chức uy tín." },
      { label: "Khuyến cáo", value: "Liên hệ trực tiếp ban tổ chức", note: "Kiểm tra sự kiện và kênh nhận tiền trước khi chuyển khoản." },
    ],
    media: [{ type: "IMAGE", url: "/images/veo-charity-03.jpg", title: "Kiểm tra nguồn trước khi đăng ký giải chạy thiện nguyện", attribution: "Ảnh minh họa CharityConnect" }],
    score: score(90, "X", 30, 18, 20, 12, 10, ["Nguồn cơ quan chức năng", "Có khuyến cáo phòng tránh", "Được gắn nhãn cảnh báo"]),
    status: "PUBLISHED",
    warning_label: "OFFICIAL_WARNING",
  },
  {
    id: "article-mps-ninhthuan",
    slug: "ninh-thuan-khoi-to-lua-dao-chiem-doat-tien-tu-thien",
    type: "SCAM_ALERT",
    title: "Ninh Thuận: khởi tố vụ giả danh từ thiện chiếm đoạt tiền",
    excerpt: "Bộ Công an công bố vụ việc đối tượng giả danh nhà hảo tâm/tổ chức từ thiện, chiếm đoạt gần 100 triệu đồng của người nhận hỗ trợ.",
    summary:
      "Đây là cảnh báo cấp A về việc không chỉ người quyên góp mà cả người nhận hỗ trợ cũng có thể trở thành nạn nhân. Hệ thống dùng vụ việc để nhấn mạnh kiểm tra danh tính và kênh liên hệ chính thức.",
    body: [
      "Vụ việc cho thấy thủ đoạn giả danh tổ chức từ thiện hoặc nhà hảo tâm để yêu cầu nạn nhân chuyển lại tiền, phí hoặc thông tin tài khoản.",
      "Khi nhận được yêu cầu liên quan tiền từ người tự xưng là tổ chức từ thiện, người dân nên kiểm tra qua số điện thoại/website chính thức và không cung cấp mã OTP, mật khẩu, thông tin ngân hàng.",
      "CharityConnect lưu vụ việc dưới dạng cảnh báo đã có cơ quan xử lý, dùng cho giáo dục phòng tránh và dashboard KPI cảnh báo.",
    ],
    source: byId["source-bocongan"],
    source_url: "https://mps.gov.vn/bai-viet/ninh-thuan-khoi-to-doi-tuong-lua-dao-chiem-doat-tien-tu-thien-d22-t45371",
    source_title: "Cổng thông tin điện tử Bộ Công an",
    source_published_at: "2025-05-30",
    collected_at: NOW,
    updated_at: NOW,
    image_url: "/images/food-support.jpg",
    tags: ["cảnh báo", "khởi tố", "giả danh"],
    badges: ["Nguồn cấp A", "Đã xử lý", "Có số tiền"],
    claims: [
      { label: "Số tiền chiếm đoạt", value: "Gần 100 triệu VND", note: "Theo thông tin Bộ Công an công bố." },
      { label: "Nạn nhân được ghi nhận", value: "3 người nhận hỗ trợ", note: "Dữ liệu dùng để cảnh báo, không hiển thị thông tin cá nhân." },
    ],
    media: [{ type: "IMAGE", url: "/images/food-support.jpg", title: "Không cung cấp thông tin tài khoản cho người tự xưng hỗ trợ", attribution: "Ảnh minh họa CharityConnect" }],
    score: score(92, "X", 30, 20, 20, 12, 10, ["Nguồn cơ quan chức năng", "Có số tiền/vụ việc cụ thể", "Đã có quyết định xử lý"]),
    status: "PUBLISHED",
    warning_label: "OFFICIAL_ACTION",
  },
  {
    id: "article-vtv24-warning-video",
    slug: "video-minh-bach-canh-bao-tu-thien-gia",
    type: "VIDEO",
    title: "Video minh bạch: nhận diện lời kêu gọi từ thiện giả",
    excerpt: "Video/bản tin chính thống được dùng như bằng chứng truyền thông để nhắc người dùng kiểm tra nguồn trước khi chuyển tiền.",
    summary:
      "CharityConnect không tải lại video. Giao diện chỉ nhúng hoặc dẫn về nguồn gốc, kèm tóm tắt ngắn và danh sách dấu hiệu cần kiểm tra.",
    body: [
      "Video là lớp bằng chứng bổ sung giúp người dùng nhìn thấy thủ đoạn cụ thể: tài khoản cá nhân lạ, ảnh cảm xúc nhưng không có chứng từ, lời kêu gọi gấp và thiếu đường dẫn chính thức.",
      "Nếu nguồn video không cho phép nhúng, hệ thống hiển thị thumbnail minh họa và nút mở nguồn gốc.",
    ],
    source: byId["source-vtv24"],
    source_url: "https://vtv.vn/",
    source_title: "VTV/VTV24",
    source_published_at: "2025",
    collected_at: NOW,
    updated_at: NOW,
    image_url: "/images/veo-charity-02.jpg",
    tags: ["video", "cảnh báo", "minh bạch"],
    badges: ["Có video", "Nguồn chính thống", "Giáo dục phòng tránh"],
    claims: [{ label: "Loại bằng chứng", value: "Video/bản tin chính thống", note: "Dùng để dẫn người xem về nguồn gốc, không sao chép nội dung." }],
    media: [{ type: "VIDEO", url: "https://vtv.vn/", thumbnail_url: "/images/veo-charity-02.jpg", title: "Xem thêm tại nguồn chính thống", attribution: "VTV/VTV24" }],
    score: score(76, "B", 25, 10, 18, 15, 8, ["Nguồn video chính thống", "Có giá trị giáo dục", "Cần link video cụ thể khi ingest live"]),
    status: "PUBLISHED",
  },
];

export const contentMetrics: ContentMetric[] = [
  {
    id: "metric-nuoiem-cost-2025",
    label: "Chi phí nuôi cơm một em",
    numeric_value: 1450000,
    display_value: "1.450.000 VND/năm học",
    unit: "VND_PER_YEAR",
    metric_type: "COST",
    period: "Năm học 2025-2026",
    source_url: "https://www.nuoiem.com/",
    source_name: "Nuôi Em",
    collected_at: NOW,
    confidence_level: "C",
  },
  {
    id: "metric-nuoiem-target-2025",
    label: "Mục tiêu trẻ được nhận nuôi",
    numeric_value: 120000,
    display_value: "120.000+ trẻ",
    unit: "PEOPLE",
    metric_type: "BENEFICIARY",
    period: "Năm học 2025-2026",
    source_url: "https://www.nuoiem.com/",
    source_name: "Nuôi Em",
    collected_at: NOW,
    confidence_level: "C",
  },
  {
    id: "metric-tuthienthat-balance",
    label: "Số dư tài khoản thiện nguyện",
    numeric_value: 965161002,
    display_value: "965.161.002 VND",
    unit: "VND",
    metric_type: "FINANCIAL_BALANCE",
    period: "Theo trang sao kê công khai",
    source_url: "https://tuthienthat.vn/sao-ke-tai-chinh/",
    source_name: "Từ Thiện Thật",
    collected_at: NOW,
    confidence_level: "C",
  },
  {
    id: "metric-tuthienthat-receipts",
    label: "Tổng thu công bố",
    numeric_value: 1100881002,
    display_value: "1.100.881.002 VND",
    unit: "VND",
    metric_type: "SUPPORT_AMOUNT",
    period: "Theo trang sao kê công khai",
    source_url: "https://tuthienthat.vn/sao-ke-tai-chinh/",
    source_name: "Từ Thiện Thật",
    collected_at: NOW,
    confidence_level: "C",
  },
  {
    id: "metric-redcross-cuba-amount",
    label: "Ủng hộ nhân dân Cuba",
    numeric_value: 291800000000,
    display_value: "291,8 tỷ VND",
    unit: "VND",
    metric_type: "SUPPORT_AMOUNT",
    period: "17/08/2025",
    source_url: "https://redcross.org.vn/so-tien-ung-ho-nhan-dan-cuba-dat-gan-292-ty-dong.html",
    source_name: "Hội Chữ thập đỏ Việt Nam",
    collected_at: NOW,
    confidence_level: "A",
  },
  {
    id: "metric-redcross-cuba-contributors",
    label: "Lượt người tham gia ủng hộ Cuba",
    numeric_value: 1480000,
    display_value: "Hơn 1,48 triệu lượt",
    unit: "COUNT",
    metric_type: "BENEFICIARY",
    period: "17/08/2025",
    source_url: "https://redcross.org.vn/so-tien-ung-ho-nhan-dan-cuba-dat-gan-292-ty-dong.html",
    source_name: "Hội Chữ thập đỏ Việt Nam",
    collected_at: NOW,
    confidence_level: "A",
  },
  {
    id: "metric-redcross-students-milk",
    label: "Học sinh vùng khó khăn nhận sữa",
    numeric_value: 15700,
    display_value: "Hơn 15.700 học sinh",
    unit: "PEOPLE",
    metric_type: "BENEFICIARY",
    period: "Năm học 2025-2026",
    source_url: "https://redcross.org.vn/",
    source_name: "Hội Chữ thập đỏ Việt Nam",
    collected_at: NOW,
    confidence_level: "A",
  },
  {
    id: "metric-mps-ninhthuan-fraud",
    label: "Chiếm đoạt qua giả danh từ thiện",
    numeric_value: 100000000,
    display_value: "Gần 100 triệu VND",
    unit: "VND",
    metric_type: "FRAUD_AMOUNT",
    period: "Tháng 5/2025",
    source_url: "https://mps.gov.vn/bai-viet/ninh-thuan-khoi-to-doi-tuong-lua-dao-chiem-doat-tien-tu-thien-d22-t45371",
    source_name: "Bộ Công an",
    collected_at: NOW,
    confidence_level: "A",
  },
  {
    id: "metric-mps-online-scam-cases",
    label: "Vụ lừa đảo trực tuyến toàn quốc",
    numeric_value: 17200,
    display_value: "Khoảng 17.200 vụ",
    unit: "COUNT",
    metric_type: "ALERT_CASE",
    period: "2022 đến 10/2025",
    source_url: "https://mps.gov.vn/",
    source_name: "Bộ Công an",
    collected_at: NOW,
    confidence_level: "A",
  },
  {
    id: "metric-unicef-wasting",
    label: "Trẻ suy dinh dưỡng cấp tính nặng hằng năm",
    numeric_value: 200000,
    display_value: "Hơn 200.000 trẻ/năm",
    unit: "PEOPLE",
    metric_type: "SOURCE_STATISTIC",
    period: "Theo trang UNICEF Nutrition",
    source_url: "https://www.unicef.org/vietnam/nutrition",
    source_name: "UNICEF Việt Nam",
    collected_at: NOW,
    confidence_level: "A",
  },
  {
    id: "metric-unicef-stunting",
    label: "Trẻ dưới 5 tuổi thấp còi",
    numeric_value: 1800000,
    display_value: "1,8 triệu trẻ dưới 5 tuổi",
    unit: "PEOPLE",
    metric_type: "SOURCE_STATISTIC",
    period: "Theo trang UNICEF Nutrition",
    source_url: "https://www.unicef.org/vietnam/nutrition",
    source_name: "UNICEF Việt Nam",
    collected_at: NOW,
    confidence_level: "A",
  },
];

function metricById(id: string): ContentMetric {
  const metric = contentMetrics.find((item) => item.id === id);
  if (!metric) throw new Error(`Missing metric ${id}`);
  return metric;
}

export const realProjects: RealProject[] = [
  {
    id: "real-project-nuoiem",
    slug: "nuoi-em-mua-2025-2026",
    name: "Nuôi Em mùa 2025-2026",
    organization: "Dự án Nuôi Em",
    category: "Giáo dục / bữa ăn học đường",
    source_url: "https://www.nuoiem.com/",
    source_name: "Nuôi Em",
    description: "Nguồn tự công bố về mô hình nhận mã em nuôi, chi phí một năm học và mục tiêu trẻ được nhận nuôi.",
    image_url: "/images/education.jpg",
    metrics: [metricById("metric-nuoiem-cost-2025"), metricById("metric-nuoiem-target-2025")],
    score: score(82, "B", 20, 22, 16, 15, 9, ["Có số liệu chi phí", "Có quy trình nhận mã", "Cần đối chiếu nguồn độc lập"]),
    status: "PUBLISHED",
  },
  {
    id: "real-project-tuthienthat",
    slug: "tu-thien-that-sao-ke-tai-chinh",
    name: "Từ Thiện Thật - sao kê tài chính",
    organization: "Từ Thiện Thật",
    category: "Minh bạch tài chính",
    source_url: "https://tuthienthat.vn/sao-ke-tai-chinh/",
    source_name: "Từ Thiện Thật",
    description: "Nguồn tự công bố tổng thu, số dư và minh bạch chi tiêu qua trang sao kê.",
    image_url: "/images/community.jpg",
    metrics: [metricById("metric-tuthienthat-balance"), metricById("metric-tuthienthat-receipts")],
    score: score(78, "B", 20, 25, 14, 10, 9, ["Có trang sao kê", "Có số liệu thu/số dư", "Cần kiểm tra chứng từ chi"]),
    status: "PUBLISHED",
  },
  {
    id: "real-project-redcross-cuba",
    slug: "ung-ho-nhan-dan-cuba",
    name: "Ủng hộ nhân dân Cuba",
    organization: "Hội Chữ thập đỏ Việt Nam",
    category: "Cứu trợ / nhân đạo quốc tế",
    source_url: "https://redcross.org.vn/so-tien-ung-ho-nhan-dan-cuba-dat-gan-292-ty-dong.html",
    source_name: "Hội Chữ thập đỏ Việt Nam",
    description: "Chiến dịch có số tiền công bố, lượt tham gia và thời gian vận động rõ ràng.",
    image_url: "/images/food-support.jpg",
    metrics: [metricById("metric-redcross-cuba-amount"), metricById("metric-redcross-cuba-contributors")],
    score: score(92, "A", 30, 25, 20, 8, 9, ["Nguồn cấp A", "Có số tiền/lượt tham gia", "Có ngày công bố rõ"]),
    status: "PUBLISHED",
  },
  {
    id: "real-project-unicef-nutrition",
    slug: "dinh-duong-tre-em-viet-nam",
    name: "Dinh dưỡng trẻ em tại Việt Nam",
    organization: "UNICEF Việt Nam",
    category: "Dinh dưỡng / trẻ em",
    source_url: "https://www.unicef.org/vietnam/nutrition",
    source_name: "UNICEF Việt Nam",
    description: "Nguồn thống kê nền về suy dinh dưỡng, trẻ thấp còi và nhu cầu can thiệp dinh dưỡng.",
    image_url: "/images/medical-support.jpg",
    metrics: [metricById("metric-unicef-wasting"), metricById("metric-unicef-stunting")],
    score: score(94, "A", 30, 18, 20, 16, 10, ["Nguồn quốc tế chính thức", "Có số liệu định lượng", "Phù hợp làm bối cảnh chiến dịch"]),
    status: "PUBLISHED",
  },
];

function buildStatistics(): ContentStatistics {
  const publishedProjects = realProjects.filter((project) => project.status === "PUBLISHED");
  const usedMetricIds = new Set(publishedProjects.flatMap((project) => project.metrics.map((metric) => metric.id)));
  const metrics = contentMetrics.filter((metric) => usedMetricIds.has(metric.id));
  const officialMetrics = metrics.filter((metric) => metric.confidence_level === "A" || metric.confidence_level === "B");
  const totalReportedAmount = metrics
    .filter((metric) => metric.unit === "VND" && metric.metric_type === "SUPPORT_AMOUNT")
    .reduce((sum, metric) => sum + metric.numeric_value, 0);
  // Người ĐƯỢC hỗ trợ: chỉ tính beneficiary thật (đơn vị người), KHÔNG gộp số liệu nhu cầu (trẻ cần hỗ trợ).
  const totalReportedBeneficiaries = metrics
    .filter((metric) => metric.unit === "PEOPLE" && metric.metric_type === "BENEFICIARY")
    .reduce((sum, metric) => sum + metric.numeric_value, 0);
  // Bối cảnh nhu cầu: số người/trẻ CẦN hỗ trợ theo thống kê nền (tách riêng để không nhầm với người được hỗ trợ).
  const totalNeedContext = metrics
    .filter((metric) => metric.unit === "PEOPLE" && metric.metric_type === "SOURCE_STATISTIC")
    .reduce((sum, metric) => sum + metric.numeric_value, 0);

  return {
    sources_total: contentSources.length,
    real_projects: publishedProjects.length,
    metric_claims: metrics.length,
    official_source_rate: Math.round((officialMetrics.length / Math.max(1, metrics.length)) * 100),
    alert_cases: contentArticles.filter((article) => article.status === "PUBLISHED" && (article.type === "ALERT" || article.type === "SCAM_ALERT")).length,
    total_reported_amount: totalReportedAmount,
    total_reported_beneficiaries: totalReportedBeneficiaries,
    total_need_context: totalNeedContext,
    updated_at: NOW,
    grade_distribution: publishedProjects.reduce<Record<TrustGrade, number>>((acc, project) => {
      acc[project.score.grade] += 1;
      return acc;
    }, { A: 0, B: 0, C: 0, D: 0, X: 0 }),
  };
}

export const contentStatistics = buildStatistics();

function buildKpis(articles: ContentArticle[] = contentArticles): ContentKpiSummary {
  const published = articles.filter((article) => article.status === "PUBLISHED");
  const distribution = published.reduce<Record<TrustGrade, number>>((acc, article) => {
    acc[article.score.grade] += 1;
    return acc;
  }, { A: 0, B: 0, C: 0, D: 0, X: 0 });
  const withEvidence = published.filter((article) => article.claims.length > 0 && article.media.length > 0).length;

  return {
    sources_total: contentSources.length,
    official_articles: published.filter((article) => article.source.level === "A" || article.source.level === "B").length,
    alert_cases: published.filter((article) => article.type === "ALERT" || article.type === "SCAM_ALERT").length,
    evidence_rate: Math.round((withEvidence / Math.max(1, published.length)) * 100),
    live_source_rate: 100,
    updated_30d: published.length,
    original_clicks: 1284,
    article_count: published.length,
    grade_distribution: distribution,
  };
}

export const contentKpis = buildKpis();

export const contentHomeSeed: ContentHome = {
  hero: {
    title: "Kiểm chứng trước khi quyên góp",
    subtitle: "CharityConnect tổng hợp nguồn chính thống, số liệu công bố và cảnh báo từ thiện giả để bảo vệ lòng tốt của cộng đồng.",
    primary_cta: "Tra cứu ngay",
    secondary_cta: "Xem cảnh báo",
  },
  kpis: contentKpis,
  featured: contentArticles.filter((article) => ["ORGANIZATION", "TRANSPARENCY", "DATA", "REAL_PROJECT", "REAL_STATISTIC", "FINANCIAL_REPORT"].includes(article.type)),
  alerts: contentArticles.filter((article) => article.type === "ALERT" || article.type === "SCAM_ALERT"),
  videos: contentArticles.filter((article) => article.type === "VIDEO"),
  sources: contentSources,
  projects: realProjects,
  statistics: contentStatistics,
};
