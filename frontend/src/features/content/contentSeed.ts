import type { ContentArticle, ContentHome, ContentKpiSummary, ContentSource, TrustGrade } from "../../types";

// Seed đã kiểm duyệt: mọi URL là bài viết/video THẬT đã được xác minh link sống ngày 03-04/07/2026.
// Chỉ lưu tiêu đề, tóm tắt tự viết, số liệu trích xuất và link về nguồn gốc — không copy nguyên bài.

export const contentSources: ContentSource[] = [
  {
    id: "source-bocongan",
    name: "Bộ Công an",
    url: "https://bocongan.gov.vn/",
    level: "A",
    kind: "GOVERNMENT",
    description: "Cổng thông tin Bộ Công an — nguồn cấp A cho cảnh báo thủ đoạn, tin khởi tố/xử lý và khuyến cáo phòng tránh lừa đảo từ thiện."
  },
  {
    id: "source-chinhphu",
    name: "Báo điện tử Chính phủ",
    url: "https://baochinhphu.vn/",
    level: "A",
    kind: "GOVERNMENT",
    description: "Báo điện tử Chính phủ (VGP) — nguồn cấp A cho số liệu thống kê chính thức về lừa đảo trực tuyến và chính sách quản lý từ thiện."
  },
  {
    id: "source-nhandan",
    name: "Báo Nhân Dân",
    url: "https://nhandan.vn/",
    level: "B",
    kind: "PRESS",
    description: "Báo chí chính thống — dùng cho tin vụ việc được biên tập, cảnh báo giả mạo và phổ biến quy định minh bạch từ thiện."
  },
  {
    id: "source-vtv",
    name: "VTV",
    url: "https://vtv.vn/",
    level: "B",
    kind: "PRESS",
    description: "Đài Truyền hình Việt Nam — bản tin cảnh báo giả mạo và trục lợi từ thiện trên không gian mạng."
  },
  {
    id: "source-vtv24",
    name: "VTV24 (YouTube)",
    url: "https://www.youtube.com/@vtv24",
    level: "B",
    kind: "VIDEO",
    description: "Kênh YouTube chính thức của Trung tâm Sản xuất và Phát triển nội dung số VTV — video phóng sự về minh bạch và lừa đảo từ thiện."
  },
  {
    id: "source-nuoiem",
    name: "Nuôi Em",
    url: "https://www.nuoiem.com/",
    level: "C",
    kind: "OFFICIAL_ORG",
    description: "Website chính thức dự án Nuôi Em — nguồn tổ chức tự công bố về mô hình nhận mã, chi phí và công khai tài chính."
  },
  {
    id: "source-tuthienthat",
    name: "Từ Thiện Thật",
    url: "https://tuthienthat.vn/",
    level: "C",
    kind: "OFFICIAL_ORG",
    description: "Website tổ chức Từ Thiện Thật — nguồn tự công bố với chuyên mục sao kê tài chính, minh bạch chi tiêu và hoàn cảnh thật."
  }
];

const byId = Object.fromEntries(contentSources.map((source) => [source.id, source] as const));

export const contentArticles: ContentArticle[] = [
  {
    id: "article-bca-giai-chay",
    slug: "bo-cong-an-canh-bao-giai-chay-tu-thien-lua-dao",
    type: "ALERT",
    title: "Cảnh báo các giải chạy từ thiện có dấu hiệu lừa đảo trên mạng xã hội",
    excerpt: "Bộ Công an cảnh báo các đối tượng lập fanpage tích xanh giả mạo bệnh viện, tổ chức uy tín để quảng cáo giải chạy từ thiện và thu phí đăng ký qua đường link giả.",
    summary: "Bộ Công an ghi nhận tình trạng tài khoản mạng xã hội giả mạo bệnh viện, quỹ từ thiện uy tín (kể cả tích xanh) chạy quảng cáo các giải chạy, đạp xe từ thiện gây quỹ hỗ trợ bệnh nhân ung thư, rồi dẫn dụ người dân chuyển tiền đăng ký qua link giả. Thủ đoạn này vừa chiếm đoạt tiền của người tham gia, vừa ảnh hưởng trực tiếp đến bệnh nhân cần hỗ trợ thật.",
    body: [
      "Theo cảnh báo đăng trên Cổng thông tin Bộ Công an ngày 10/09/2025, các đối tượng sao chép toàn bộ logo, nội dung, hình ảnh của các bệnh viện và tổ chức uy tín — thậm chí dùng tài khoản có dấu tích xanh — để tạo lòng tin, sau đó quảng cáo các \"giải chạy từ thiện\", \"hành trình tiếp sức\" và yêu cầu chuyển tiền đăng ký qua các đường dẫn giả mạo.",
      "Bộ Công an khuyến cáo: kiểm tra kỹ thông tin sự kiện và liên hệ trực tiếp ban tổ chức để xác minh; không gửi tiền vào tài khoản ngân hàng không rõ nguồn gốc; chỉ ủng hộ qua các quỹ uy tín được cơ quan chức năng công nhận.",
      "Trên CharityConnect, bài này được gắn nhãn cảnh báo cấp A (cơ quan chức năng phát cảnh báo). Người dùng nên đọc bản gốc tại nguồn trước khi chia sẻ hoặc ra quyết định."
    ],
    source: byId["source-bocongan"],
    source_url: "https://bocongan.gov.vn/bai-viet/canh-bao-cac-giai-chay-tu-thien-co-dau-hieu-lua-dao-tren-mang-xa-hoi-1757472719",
    source_title: "Cổng thông tin Bộ Công an",
    source_published_at: "2025-09-10",
    collected_at: "2026-07-03T00:00:00.000Z",
    updated_at: "2026-07-03T00:00:00.000Z",
    image_url: "/images/veo-charity-03.jpg",
    tags: ["giải chạy từ thiện", "fanpage giả mạo", "cảnh báo"],
    badges: ["Nguồn cấp A", "Cơ quan chức năng cảnh báo", "Link đã kiểm chứng"],
    claims: [
      { label: "Thủ đoạn chính", value: "Fanpage tích xanh giả mạo", note: "Sao chép logo, nội dung của bệnh viện/tổ chức uy tín rồi chạy quảng cáo giải chạy từ thiện." },
      { label: "Cách chiếm đoạt", value: "Thu phí đăng ký qua link giả", note: "Người đăng ký chuyển tiền vào tài khoản do đối tượng kiểm soát." }
    ],
    media: [
      { type: "IMAGE", url: "/images/veo-charity-03.jpg", title: "Kiểm tra ban tổ chức trước khi đăng ký giải chạy thiện nguyện", attribution: "Ảnh minh họa CharityConnect" }
    ],
    score: {
      total: 74,
      grade: "X",
      source_authority: 30,
      financial_evidence: 10,
      legal_identity: 16,
      media_evidence: 8,
      freshness: 10,
      reasons: ["Nguồn cơ quan nhà nước cấp A", "Cảnh báo chính thức, chưa kèm số liệu vụ án", "Bài mới (09/2025), link đã kiểm chứng"]
    },
    status: "PUBLISHED",
    warning_label: "OFFICIAL_WARNING"
  },
  {
    id: "article-nhandan-ni-su",
    slug: "khoi-to-gia-danh-ni-su-keu-goi-tu-thien-chiem-doat-hon-10-ty",
    type: "ALERT",
    title: "Khởi tố, bắt tạm giam đối tượng giả danh quyên góp tiền từ thiện để chiếm đoạt hàng chục tỷ đồng",
    excerpt: "Công an TP Đà Nẵng khởi tố đối tượng lập tài khoản Facebook giả danh 'Ni sư Thích Nữ Tường Phúc' kêu gọi quyên góp, tổng giao dịch hơn 10 tỷ đồng.",
    summary: "Theo Báo Nhân Dân (24/04/2024), Công an TP Đà Nẵng đã khởi tố, bắt tạm giam Lê Đình Hải (sinh 1998) về tội lừa đảo chiếm đoạt tài sản. Đối tượng tạo các tài khoản Facebook giả danh Ni sư, đăng hình ảnh hoàn cảnh thương tâm rồi kêu gọi chuyển tiền vào nhiều tài khoản cá nhân; tổng giao dịch ghi nhận hơn 10 tỷ đồng từ hàng chục nghìn lượt chuyển tiền.",
    body: [
      "Vụ án là ví dụ điển hình cho thủ đoạn dùng danh tính tôn giáo giả và câu chuyện thương tâm để đánh vào lòng trắc ẩn. Từ đầu năm 2021 đến khi bị bắt (04/2024), đối tượng sử dụng hơn 12 thẻ ngân hàng các loại để nhận và phân tán dòng tiền.",
      "Cơ quan điều tra ghi nhận tổng giao dịch hơn 10 tỷ đồng, trong đó tài khoản cá nhân của đối tượng nhận gần 6 tỷ đồng và các tài khoản liên quan nhận thêm hàng tỷ đồng.",
      "Bài học kiểm chứng: không chuyển tiền vào tài khoản cá nhân khi lời kêu gọi không đi kèm tổ chức có pháp nhân, báo cáo minh bạch và kênh xác minh chính thức. Vụ việc đã có quyết định khởi tố — mức căn cứ cao nhất trong thang nhãn của CharityConnect."
    ],
    source: byId["source-nhandan"],
    source_url: "https://nhandan.vn/khoi-to-bat-tam-giam-doi-tuong-gia-danh-quyen-gop-tien-tu-thien-de-chiem-doat-hang-chuc-ty-dong-post806310.html",
    source_title: "Báo Nhân Dân",
    source_published_at: "2024-04-24",
    collected_at: "2026-07-03T00:00:00.000Z",
    updated_at: "2026-07-03T00:00:00.000Z",
    image_url: "/images/food-support.jpg",
    tags: ["khởi tố", "giả danh", "Đà Nẵng"],
    badges: ["Đã khởi tố", "Có số liệu", "Link đã kiểm chứng"],
    claims: [
      { label: "Tổng giao dịch ghi nhận", value: "Hơn 10 tỷ đồng", note: "Số liệu theo cơ quan điều tra, đăng trên Báo Nhân Dân 24/04/2024." },
      { label: "Thủ đoạn", value: "Giả danh Ni sư trên Facebook", note: "Đăng hoàn cảnh thương tâm, kêu gọi chuyển tiền vào nhiều tài khoản cá nhân." },
      { label: "Công cụ nhận tiền", value: "Hơn 12 thẻ ngân hàng", note: "Dòng tiền bị phân tán qua nhiều tài khoản đứng tên người khác." }
    ],
    media: [
      { type: "IMAGE", url: "/images/food-support.jpg", title: "Cảnh giác lời kêu gọi gắn danh tính tôn giáo không xác minh", attribution: "Ảnh minh họa CharityConnect" }
    ],
    score: {
      total: 88,
      grade: "X",
      source_authority: 25,
      financial_evidence: 22,
      legal_identity: 18,
      media_evidence: 13,
      freshness: 10,
      reasons: ["Báo chí chính thống đưa tin theo cơ quan điều tra", "Có số liệu định lượng chi tiết", "Vụ việc đã khởi tố — nhãn căn cứ cao nhất"]
    },
    status: "PUBLISHED",
    warning_label: "OFFICIAL_ACTION"
  },
  {
    id: "article-bca-mao-danh-tai-khoan",
    slug: "khoi-to-mao-danh-tai-khoan-tu-thien-gan-700-nan-nhan",
    type: "ALERT",
    title: "Khởi tố đối tượng mạo danh tài khoản từ thiện để lừa đảo chiếm đoạt tài sản của hàng trăm người",
    excerpt: "Đối tượng lập tài khoản Facebook nhái tên và ảnh đại diện của người kêu gọi từ thiện thật, bình luận báo 'tài khoản lỗi' để hướng dòng tiền về tài khoản của mình.",
    summary: "Theo Cổng thông tin Bộ Công an, Công an tỉnh Đắk Nông bắt giữ Vy Bảo Châu (05/2024) vì mạo danh các tài khoản kêu gọi từ thiện có thật. Từ 06/2023 đến 05/2024, đối tượng lừa gần 700 bị hại trên cả nước, chiếm đoạt hơn 400 triệu đồng, mỗi nạn nhân từ 50 nghìn đến 15 triệu đồng.",
    body: [
      "Thủ đoạn tinh vi ở chỗ đối tượng không tạo hoàn cảnh giả, mà 'ăn theo' các bài kêu gọi từ thiện thật: lập tài khoản trùng tên, trùng ảnh đại diện với người kêu gọi, rồi vào bình luận thông báo tài khoản chính bị lỗi và đề nghị chuyển vào số tài khoản khác do mình kiểm soát.",
      "Vì bám vào chiến dịch thật, người quyên góp gần như không nghi ngờ. Cơ quan công an khuyến cáo các tổ chức, cá nhân vận động từ thiện chỉ công khai duy nhất một số tài khoản chính thức, và người ủng hộ phải đối chiếu số tài khoản với kênh công bố gốc trước khi chuyển tiền.",
      "Đây chính là kịch bản mà tính năng tra cứu nguồn và xác minh biên nhận của CharityConnect nhắm tới: mọi khoản quyên góp cần kiểm chứng được tài khoản nhận và tổ chức đứng sau."
    ],
    source: byId["source-bocongan"],
    source_url: "https://bocongan.gov.vn/bai-viet/khoi-to-doi-tuong-mao-danh-tai-khoan-tu-thien-de-lua-dao-chiem-doat-tai-san-cua-hang-tram-nguoi-d22-t39028",
    source_title: "Cổng thông tin Bộ Công an",
    source_published_at: "2024-05-04",
    collected_at: "2026-07-03T00:00:00.000Z",
    updated_at: "2026-07-03T00:00:00.000Z",
    image_url: "/images/medical-support.jpg",
    tags: ["mạo danh", "khởi tố", "tài khoản ngân hàng"],
    badges: ["Nguồn cấp A", "Đã khởi tố", "Có số liệu"],
    claims: [
      { label: "Số bị hại", value: "Gần 700 người", note: "Trải rộng tại Đắk Nông và nhiều tỉnh thành, giai đoạn 06/2023–05/2024." },
      { label: "Số tiền chiếm đoạt", value: "Hơn 400 triệu đồng", note: "Mỗi bị hại bị lừa từ 50.000 đ đến 15 triệu đồng." },
      { label: "Thủ đoạn", value: "Bình luận báo 'tài khoản lỗi'", note: "Nhái tên + ảnh đại diện người kêu gọi thật rồi điều hướng sang tài khoản của đối tượng." }
    ],
    media: [
      { type: "IMAGE", url: "/images/medical-support.jpg", title: "Đối chiếu số tài khoản với kênh công bố chính thức", attribution: "Ảnh minh họa CharityConnect" }
    ],
    score: {
      total: 91,
      grade: "X",
      source_authority: 30,
      financial_evidence: 20,
      legal_identity: 20,
      media_evidence: 11,
      freshness: 10,
      reasons: ["Nguồn cơ quan nhà nước cấp A", "Số liệu bị hại và số tiền cụ thể", "Đã khởi tố bị can"]
    },
    status: "PUBLISHED",
    warning_label: "OFFICIAL_ACTION"
  },
  {
    id: "article-nhandan-chu-thap-do",
    slug: "mao-danh-hoi-chu-thap-do-quang-ninh-sau-bao-so-3",
    type: "ALERT",
    title: "Mạo danh Hội Chữ thập đỏ Quảng Ninh lừa đảo kêu gọi quyên góp ủng hộ người dân vùng bão",
    excerpt: "Ngay sau bão số 3 (Yagi), fanpage giả mạo Hội Chữ thập đỏ tỉnh Quảng Ninh xuất hiện trên Facebook để chiếm đoạt tiền ủng hộ đồng bào vùng bão.",
    summary: "Theo Báo Nhân Dân (10/09/2024), các đối tượng lập fanpage giả mạo Hội Chữ thập đỏ tỉnh Quảng Ninh kêu gọi quyên góp ủng hộ người dân bị thiệt hại do bão số 3. Sở Thông tin và Truyền thông Quảng Ninh phát cảnh báo, khuyến cáo người dân chỉ chuyển tiền vào các tài khoản chính thống đã được xác minh.",
    body: [
      "Lừa đảo 'ăn theo thiên tai' là dạng phổ biến nhất: mỗi đợt bão lũ, hàng loạt fanpage giả mạo tổ chức cứu trợ mọc lên trong vài giờ, dùng hình ảnh hiện trường thật để kêu gọi chuyển khoản khẩn cấp.",
      "Dấu hiệu nhận biết quan trọng: tài khoản nhận tiền của tổ chức chính thống luôn đứng tên tổ chức, không phải tên cá nhân; thông tin kêu gọi phải xuất hiện đồng thời trên website/kênh chính thức của tổ chức đó.",
      "CharityConnect gắn nhãn 'Báo chí chính thống cảnh báo' cho vụ việc này. Trước khi ủng hộ cứu trợ thiên tai, hãy vào thẳng website chính thức của tổ chức thay vì bấm link từ mạng xã hội."
    ],
    source: byId["source-nhandan"],
    source_url: "https://nhandan.vn/mao-danh-hoi-chu-thap-do-quang-ninh-lua-dao-keu-goi-quyen-gop-ung-ho-nguoi-dan-vung-bao-post829886.html",
    source_title: "Báo Nhân Dân",
    source_published_at: "2024-09-10",
    collected_at: "2026-07-03T00:00:00.000Z",
    updated_at: "2026-07-03T00:00:00.000Z",
    image_url: "/images/community.jpg",
    tags: ["bão số 3", "fanpage giả mạo", "cứu trợ thiên tai"],
    badges: ["Báo chí chính thống", "Cảnh báo", "Link đã kiểm chứng"],
    claims: [
      { label: "Đối tượng bị giả mạo", value: "Hội Chữ thập đỏ Quảng Ninh", note: "Fanpage nhái xuất hiện ngay sau bão số 3 (Yagi), 09/2024." },
      { label: "Cơ quan cảnh báo", value: "Sở TT&TT Quảng Ninh", note: "Khuyến cáo chỉ chuyển tiền vào tài khoản chính thống đã xác minh." }
    ],
    media: [
      { type: "IMAGE", url: "/images/community.jpg", title: "Ủng hộ cứu trợ qua kênh chính thức của tổ chức", attribution: "Ảnh minh họa CharityConnect" }
    ],
    score: {
      total: 79,
      grade: "X",
      source_authority: 25,
      financial_evidence: 12,
      legal_identity: 18,
      media_evidence: 14,
      freshness: 10,
      reasons: ["Báo chí chính thống", "Có cơ quan quản lý địa phương phát cảnh báo", "Điển hình lừa đảo ăn theo thiên tai"]
    },
    status: "PUBLISHED",
    warning_label: "PRESS_WARNING"
  },
  {
    id: "article-vtv-fanpage-tich-xanh",
    slug: "fanpage-tich-xanh-gia-danh-to-chuc-keu-goi-giai-chay",
    type: "ALERT",
    title: "Giả danh tổ chức uy tín, lập fanpage tích xanh kêu gọi giải chạy từ thiện lừa đảo",
    excerpt: "VTV phản ánh thủ đoạn dùng fanpage có tích xanh, sao chép logo bệnh viện và quỹ uy tín để bán 'số báo danh' giải chạy từ thiện không có thật.",
    summary: "Theo VTV (10/09/2025), các đối tượng tạo fanpage có dấu tích xanh, sao chép nhận diện của các bệnh viện và quỹ từ thiện lớn, quảng bá giải chạy - đạp xe từ thiện hư cấu rồi thu phí đăng ký qua link giả. Công an Hà Nội khuyến cáo xác minh trực tiếp với ban tổ chức và chỉ ủng hộ qua các quỹ hợp pháp.",
    body: [
      "Tích xanh không còn là bảo chứng: đối tượng lừa đảo có thể mua lại hoặc đổi tên các trang đã xác minh để khoác vỏ bọc uy tín. Nhận diện thương hiệu (logo, màu sắc, giọng văn) đều có thể sao chép hoàn hảo.",
      "Điểm yếu duy nhất của kẻ giả mạo là kênh đối chiếu: sự kiện thật luôn được công bố trên website chính thức của đơn vị tổ chức, có đầu mối liên hệ xác minh được.",
      "Người dùng CharityConnect được khuyến nghị dùng thanh tra cứu để kiểm tra tên tổ chức/sự kiện trước khi chuyển tiền, và báo cáo khi phát hiện trang giả mạo."
    ],
    source: byId["source-vtv"],
    source_url: "https://vtv.vn/gia-danh-to-chuc-uy-tin-lap-fanpage-tich-xanh-keu-goi-giai-chay-tu-thien-lua-dao-100250910161106656.htm",
    source_title: "VTV News",
    source_published_at: "2025-09-10",
    collected_at: "2026-07-03T00:00:00.000Z",
    updated_at: "2026-07-03T00:00:00.000Z",
    image_url: "/images/veo-charity-01.jpg",
    tags: ["tích xanh", "giải chạy", "giả mạo thương hiệu"],
    badges: ["Báo chí chính thống", "Cảnh báo", "Link đã kiểm chứng"],
    claims: [
      { label: "Vỏ bọc", value: "Fanpage có dấu tích xanh", note: "Sao chép logo, nội dung của bệnh viện và quỹ uy tín để tạo lòng tin." },
      { label: "Khuyến cáo", value: "Xác minh với ban tổ chức", note: "Công an Hà Nội: chỉ ủng hộ qua các quỹ hợp pháp như Quỹ Ngày mai tươi sáng." }
    ],
    media: [
      { type: "IMAGE", url: "/images/veo-charity-01.jpg", title: "Tích xanh không thay thế được bước xác minh nguồn", attribution: "Ảnh minh họa CharityConnect" }
    ],
    score: {
      total: 78,
      grade: "X",
      source_authority: 25,
      financial_evidence: 12,
      legal_identity: 17,
      media_evidence: 14,
      freshness: 10,
      reasons: ["Báo chí chính thống (VTV)", "Có khuyến cáo từ Công an Hà Nội", "Bài mới 09/2025"]
    },
    status: "PUBLISHED",
    warning_label: "PRESS_WARNING"
  },
  {
    id: "article-chinhphu-40000-ty",
    slug: "toi-pham-mang-thiet-hai-gan-40000-ty-2020-2025",
    type: "DATA",
    title: "Tội phạm mạng gây thiệt hại gần 40.000 tỷ đồng giai đoạn 2020-2025",
    excerpt: "Số liệu công bố tại hội thảo của Bộ Công an: 24.295 vụ lừa đảo trên không gian mạng giai đoạn 2020-2025, thiệt hại gần 40.000 tỷ đồng.",
    summary: "Theo Báo điện tử Chính phủ (29/12/2025), đại diện Cục Cảnh sát hình sự cho biết giai đoạn 2020-2025 cả nước xảy ra 24.295 vụ lừa đảo chiếm đoạt tài sản trên không gian mạng, gây thiệt hại gần 40.000 tỷ đồng. Riêng năm 2025, số vụ giảm hơn 20% nhưng thủ đoạn ngày càng tinh vi khi tội phạm tận dụng AI, tiền điện tử và danh tính ảo.",
    body: [
      "Đây là bộ số liệu nền quan trọng nhất giải thích vì sao phải kiểm chứng trước khi quyên góp: quy mô thiệt hại do lừa đảo trực tuyến tại Việt Nam ở mức hàng chục nghìn tỷ đồng, và kêu gọi từ thiện giả là một trong những kịch bản đánh trúng cảm xúc nhất.",
      "Tín hiệu tích cực là năm 2025 số vụ giảm hơn 20% so với năm trước nhờ các chiến dịch trấn áp và nâng cao nhận thức. Tuy nhiên từ 2022 đến tháng 10/2025 vẫn ghi nhận khoảng 17.200 vụ với hàng trăm nghìn nạn nhân.",
      "CharityConnect dùng các con số này cho KPI cảnh báo hệ thống — số liệu được trích dẫn nguyên trạng kèm link nguồn, không tự suy diễn cho riêng lĩnh vực từ thiện."
    ],
    source: byId["source-chinhphu"],
    source_url: "https://baochinhphu.vn/toi-pham-mang-gay-thiet-hai-gan-40000-ty-dong-giai-doan-2020-2025-102251229175200352.htm",
    source_title: "Báo điện tử Chính phủ",
    source_published_at: "2025-12-29",
    collected_at: "2026-07-03T00:00:00.000Z",
    updated_at: "2026-07-03T00:00:00.000Z",
    image_url: "/images/veo-charity-hero.jpg",
    tags: ["số liệu", "lừa đảo mạng", "Bộ Công an"],
    badges: ["Nguồn cấp A", "Có số liệu", "Link đã kiểm chứng"],
    claims: [
      { label: "Số vụ 2020-2025", value: "24.295 vụ", note: "Lừa đảo chiếm đoạt tài sản trên không gian mạng, theo Cục Cảnh sát hình sự." },
      { label: "Thiệt hại", value: "Gần 40.000 tỷ đồng", note: "Tổng thiệt hại giai đoạn 2020-2025." },
      { label: "Xu hướng 2025", value: "Giảm hơn 20%", note: "Số vụ giảm so với năm trước nhưng thủ đoạn tinh vi hơn (AI, tiền điện tử, danh tính ảo)." }
    ],
    media: [
      { type: "IMAGE", url: "/images/veo-charity-hero.jpg", title: "Kiểm chứng trước khi chuyển tiền", attribution: "Ảnh minh họa CharityConnect" }
    ],
    score: {
      total: 93,
      grade: "A",
      source_authority: 30,
      financial_evidence: 20,
      legal_identity: 20,
      media_evidence: 13,
      freshness: 10,
      reasons: ["Nguồn cấp A (Báo Chính phủ dẫn Bộ Công an)", "Số liệu định lượng đầy đủ", "Cập nhật 12/2025"]
    },
    status: "PUBLISHED"
  },
  {
    id: "article-chinhphu-18900-ty",
    slug: "lua-dao-truc-tuyen-uoc-tinh-18900-ty-nam-2024",
    type: "DATA",
    title: "Thiệt hại do lừa đảo trực tuyến ước tính 18.900 tỷ đồng năm 2024",
    excerpt: "Khảo sát hơn 59.000 người của Hiệp hội An ninh mạng quốc gia: cứ 220 người dùng smartphone có 1 người là nạn nhân lừa đảo; chỉ 45,69% trình báo cơ quan chức năng.",
    summary: "Theo Báo điện tử Chính phủ (16/12/2024), báo cáo của Hiệp hội An ninh mạng quốc gia ước tính người Việt thiệt hại 18.900 tỷ đồng vì lừa đảo trực tuyến trong năm 2024. Khảo sát trên 59.000 người cho thấy tỷ lệ nạn nhân là 1/220 người dùng; 70,72% từng nhận lời mời đầu tư giả và 62,08% gặp cuộc gọi mạo danh cơ quan chức năng.",
    body: [
      "Con số đáng chú ý nhất với người làm minh bạch từ thiện: chỉ 45,69% nạn nhân trình báo với cơ quan chức năng — nghĩa là hơn một nửa vụ việc không bao giờ được ghi nhận, và các thống kê chính thức chỉ là phần nổi.",
      "Ba kịch bản phổ biến nhất năm 2024 là mời đầu tư lợi nhuận cao (70,72% người được hỏi từng gặp), giả danh cơ quan chức năng (62,08%) và thông báo trúng thưởng giả (60,01%). Kêu gọi từ thiện giả thường trộn lẫn cả ba yếu tố: cảm xúc, danh nghĩa tổ chức và sự khẩn cấp.",
      "Khảo sát do Ban Công nghệ, Hiệp hội An ninh mạng quốc gia thực hiện từ 28/11 đến 14/12/2024 — phương pháp và mẫu được nêu rõ trong bài gốc."
    ],
    source: byId["source-chinhphu"],
    source_url: "https://baochinhphu.vn/thiet-hai-do-lua-dao-truc-tuyen-uoc-tinh-18900-ty-dong-nam-2024-102241216153209577.htm",
    source_title: "Báo điện tử Chính phủ",
    source_published_at: "2024-12-16",
    collected_at: "2026-07-03T00:00:00.000Z",
    updated_at: "2026-07-03T00:00:00.000Z",
    image_url: "/images/veo-charity-06.jpg",
    tags: ["số liệu", "khảo sát", "an ninh mạng"],
    badges: ["Nguồn cấp A", "Có số liệu", "Khảo sát 59.000 người"],
    claims: [
      { label: "Thiệt hại 2024", value: "18.900 tỷ đồng", note: "Ước tính từ báo cáo nghiên cứu an ninh mạng 2024, Hiệp hội An ninh mạng quốc gia." },
      { label: "Tỷ lệ nạn nhân", value: "1/220 người dùng", note: "Cứ 220 người dùng smartphone có 1 người bị lừa đảo trong năm 2024." },
      { label: "Tỷ lệ trình báo", value: "45,69%", note: "Hơn một nửa nạn nhân không trình báo — thống kê chính thức chỉ là phần nổi." }
    ],
    media: [
      { type: "IMAGE", url: "/images/veo-charity-06.jpg", title: "Nhận diện ba kịch bản lừa đảo phổ biến nhất", attribution: "Ảnh minh họa CharityConnect" }
    ],
    score: {
      total: 92,
      grade: "A",
      source_authority: 30,
      financial_evidence: 22,
      legal_identity: 18,
      media_evidence: 13,
      freshness: 9,
      reasons: ["Nguồn cấp A", "Khảo sát quy mô lớn có phương pháp rõ", "Số liệu chi tiết theo từng kịch bản lừa đảo"]
    },
    status: "PUBLISHED"
  },
  {
    id: "article-nghi-dinh-93",
    slug: "nghi-dinh-93-2021-minh-bach-van-dong-tu-thien",
    type: "TRANSPARENCY",
    title: "Quy định mới về cá nhân vận động từ thiện: công khai, minh bạch và có thời hạn",
    excerpt: "Nghị định 93/2021/NĐ-CP yêu cầu cá nhân vận động từ thiện phải mở tài khoản riêng cho từng cuộc vận động và công khai kết quả trong 15-30 ngày.",
    summary: "Theo Báo Nhân Dân (28/10/2021), Nghị định 93/2021/NĐ-CP (hiệu lực 11/12/2021) đặt ra khung pháp lý minh bạch cho hoạt động vận động quyên góp: cá nhân phải thông báo với UBND cấp xã, mở tài khoản ngân hàng riêng theo từng cuộc vận động, và công khai kết quả tiếp nhận trong 15 ngày, kết quả phân phối trong 30 ngày sau khi kết thúc.",
    body: [
      "Nghị định 93/2021/NĐ-CP là chuẩn pháp lý mà mọi lời kêu gọi từ thiện cá nhân tại Việt Nam phải tuân theo. Ba yêu cầu cốt lõi: thông báo chính quyền địa phương, tài khoản riêng cho từng đợt vận động, và công khai kết quả có thời hạn.",
      "Với người quyên góp, đây là bộ câu hỏi kiểm chứng nhanh: đợt vận động này đã thông báo với UBND xã chưa? Tài khoản nhận có phải tài khoản riêng mở cho đợt này không? Kết quả đợt trước có được công khai đúng hạn 15-30 ngày không?",
      "Chi phí vận động do cá nhân tự chi trả, trừ khi được người đóng góp đồng ý — quy định thường bị bỏ qua khi cá nhân trích phần trăm từ tiền quyên góp mà không công bố."
    ],
    source: byId["source-nhandan"],
    source_url: "https://nhandan.vn/quy-dinh-moi-ve-ca-nhan-van-dong-tu-thien-cong-khai-minh-bach-va-co-thoi-han-post671412.html",
    source_title: "Báo Nhân Dân",
    source_published_at: "2021-10-28",
    collected_at: "2026-07-03T00:00:00.000Z",
    updated_at: "2026-07-03T00:00:00.000Z",
    image_url: "/images/education.jpg",
    tags: ["Nghị định 93/2021", "pháp lý", "sao kê"],
    badges: ["Khung pháp lý", "Báo chí chính thống", "Link đã kiểm chứng"],
    claims: [
      { label: "Tài khoản", value: "Riêng cho từng cuộc vận động", note: "Mở tại ngân hàng thương mại, tách bạch với tài khoản cá nhân." },
      { label: "Thời hạn công khai", value: "15–30 ngày", note: "Công khai tiếp nhận trong 15 ngày, phân phối trong 30 ngày sau khi kết thúc." },
      { label: "Hiệu lực", value: "11/12/2021", note: "Áp dụng cho vận động hỗ trợ thiên tai, dịch bệnh, sự cố và bệnh nhân hiểm nghèo." }
    ],
    media: [
      { type: "IMAGE", url: "/images/education.jpg", title: "Khung pháp lý minh bạch cho vận động từ thiện", attribution: "Ảnh minh họa CharityConnect" }
    ],
    score: {
      total: 77,
      grade: "B",
      source_authority: 25,
      financial_evidence: 20,
      legal_identity: 20,
      media_evidence: 8,
      freshness: 4,
      reasons: ["Nội dung pháp lý từ báo chính thống", "Chuẩn đối chiếu cho mọi lời kêu gọi cá nhân", "Bài 2021 — độ mới thấp nhưng còn hiệu lực"]
    },
    status: "PUBLISHED"
  },
  {
    id: "article-nuoiem-model",
    slug: "nuoi-em-mo-hinh-nhan-ma-va-cong-khai-tai-chinh",
    type: "ORGANIZATION",
    title: "Nuôi Em: mô hình nhận mã em nuôi và công khai tài chính",
    excerpt: "Dự án Nuôi Em công bố chi phí 1.450.000 đ/em/năm học, hơn 95.000 em được nuôi cơm đến hết 2023 và kênh tài chính công khai tại taichinh.nuoiem.com.",
    summary: "Theo website chính thức nuoiem.com, mỗi người nuôi nhận một mã em nuôi duy nhất với chi phí 150.000 đ/tháng × 9 tháng + 100.000 đ cơ sở vật chất = 1.450.000 đ/năm học (Tây Nguyên 1.650.000 đ). Dự án tự công bố đã hỗ trợ hơn 95.000 em đến hết 2023, mục tiêu 120.000 em năm học 2025-2026, công khai tài chính tại taichinh.nuoiem.com và cập nhật ảnh/video hàng tháng từ thầy cô tại điểm trường.",
    body: [
      "Nuôi Em là ví dụ tốt về minh bạch theo thiết kế: mỗi khoản đóng góp gắn với một mã em nuôi cụ thể có thể tra cứu, ảnh/video cập nhật hàng tháng, và trang tài chính công khai riêng. Đây là các thực hành mà CharityConnect khuyến khích mọi tổ chức áp dụng.",
      "Lưu ý kiểm chứng: toàn bộ số liệu (95.000+ em, 1.000+ nhóm tại 500+ xã, 25+ tỉnh) là dữ liệu tự công bố của dự án, chưa thay thế được kiểm toán độc lập. Năm 2025, một số báo chính thống cũng đặt câu hỏi về khoảng trống giám sát và kế toán của mô hình dòng tiền lớn này; dự án sau đó công bố cam kết minh bạch và lộ trình xử lý phản ánh.",
      "Khuyến nghị cho người quyên góp: đọc trực tiếp báo cáo tài chính tại kênh công khai của dự án, đối chiếu mã em nuôi được cấp, và theo dõi các bài đối chiếu từ báo chí chính thống — tin tưởng nhưng luôn kiểm chứng."
    ],
    source: byId["source-nuoiem"],
    source_url: "https://www.nuoiem.com/",
    source_title: "Nuôi Em",
    source_published_at: "2026-06-01",
    collected_at: "2026-07-04T00:00:00.000Z",
    updated_at: "2026-07-04T00:00:00.000Z",
    image_url: "/images/education.jpg",
    tags: ["Nuôi Em", "trẻ em vùng cao", "nguồn tự công bố"],
    badges: ["Nguồn tổ chức", "Có số liệu", "Tài chính công khai"],
    claims: [
      { label: "Chi phí nuôi 1 em", value: "1.450.000 đ/năm học", note: "150.000 đ/tháng × 9 tháng + 100.000 đ cơ sở vật chất; Tây Nguyên 1.650.000 đ. Số liệu tự công bố." },
      { label: "Quy mô công bố", value: "95.000+ em (hết 2023)", note: "Mục tiêu 120.000 em năm học 2025-2026; 1.000+ nhóm tại 500+ xã, 25+ tỉnh. Tự công bố, chưa kiểm toán độc lập." },
      { label: "Kênh minh bạch", value: "taichinh.nuoiem.com", note: "Tra cứu mã em nuôi, ảnh/video cập nhật hàng tháng, thăm bản 2 lần/mùa học." }
    ],
    media: [
      { type: "IMAGE", url: "/images/education.jpg", title: "Bữa trưa cho học sinh vùng cao", attribution: "Ảnh minh họa CharityConnect" }
    ],
    score: {
      total: 82,
      grade: "B",
      source_authority: 20,
      financial_evidence: 22,
      legal_identity: 16,
      media_evidence: 15,
      freshness: 9,
      reasons: ["Nguồn tổ chức tự công bố có kênh tài chính riêng", "Minh bạch theo mã tra cứu được", "Cần đối chiếu thêm kiểm toán/báo chí độc lập"]
    },
    status: "PUBLISHED"
  },
  {
    id: "article-tuthienthat",
    slug: "tu-thien-that-sao-ke-va-chuyen-muc-minh-bach",
    type: "TRANSPARENCY",
    title: "Từ Thiện Thật: sao kê tài chính và các chuyên mục minh bạch",
    excerpt: "Website tuthienthat.vn tổ chức nội dung theo Hoàn Cảnh Thật, Tấm Lòng Vàng, Video và bộ ba chuyên mục tài chính: sao kê, minh bạch chi tiêu, báo cáo tài chính.",
    summary: "Từ Thiện Thật duy trì trang 'Sao kê tài chính' cùng các chuyên mục 'Minh bạch chi tiêu' và 'Báo cáo tài chính' công khai trên website, bên cạnh các chuyên mục nội dung Hoàn Cảnh Thật, Tấm Lòng Vàng và Video. Tổ chức công bố địa chỉ trụ sở cụ thể tại Long Biên, Hà Nội.",
    body: [
      "Cấu trúc website của Từ Thiện Thật là mẫu tham khảo tốt cho cách một tổ chức thiện nguyện tự trình bày minh bạch: tách riêng chuyên mục tài chính (sao kê, chi tiêu, báo cáo) khỏi chuyên mục câu chuyện, giúp người đọc kiểm tra dòng tiền độc lập với nội dung cảm xúc.",
      "Việc công bố địa chỉ trụ sở thực (Số 21 Khu Biệt Thự Him Lam Vĩnh Tuy, Long Biên, Hà Nội) là một tín hiệu pháp lý tích cực — người quyên góp có thể xác minh pháp nhân trước khi chuyển tiền.",
      "Là nguồn tự công bố cấp C, dữ liệu từ website này cần được đối chiếu với sao kê ngân hàng và phản hồi từ cộng đồng trước khi dùng làm căn cứ quyên góp lớn."
    ],
    source: byId["source-tuthienthat"],
    source_url: "https://tuthienthat.vn/sao-ke-tai-chinh/",
    source_title: "Từ Thiện Thật — Sao kê tài chính",
    source_published_at: "2026-06-01",
    collected_at: "2026-07-04T00:00:00.000Z",
    updated_at: "2026-07-04T00:00:00.000Z",
    image_url: "/images/community.jpg",
    tags: ["sao kê", "báo cáo tài chính", "tổ chức"],
    badges: ["Nguồn tổ chức", "Có chuyên mục sao kê", "Địa chỉ công khai"],
    claims: [
      { label: "Chuyên mục tài chính", value: "Sao kê · Chi tiêu · Báo cáo", note: "Ba chuyên mục minh bạch tách riêng trên menu chính của website." },
      { label: "Pháp nhân", value: "Địa chỉ trụ sở công khai", note: "Số 21 Khu Biệt Thự Him Lam Vĩnh Tuy, Long Biên, Hà Nội — có thể xác minh." }
    ],
    media: [
      { type: "IMAGE", url: "/images/community.jpg", title: "Chuyên mục minh bạch tách riêng khỏi nội dung câu chuyện", attribution: "Ảnh minh họa CharityConnect" }
    ],
    score: {
      total: 74,
      grade: "B",
      source_authority: 20,
      financial_evidence: 18,
      legal_identity: 14,
      media_evidence: 13,
      freshness: 9,
      reasons: ["Có chuyên mục sao kê/báo cáo công khai", "Nguồn tự công bố cấp C", "Cần đối chiếu sao kê ngân hàng độc lập"]
    },
    status: "PUBLISHED"
  },
  {
    id: "article-vtv24-16ty",
    slug: "vtv24-tieu-diem-tu-thien-16-ty-long-tot-bi-loi-dung",
    type: "VIDEO",
    title: "Tiêu điểm: Ngôi sao \"kê\" \"sáng\" trở lại sau vụ từ thiện 16 tỷ — khi lòng tốt bị lợi dụng",
    excerpt: "Phóng sự VTV24 về vụ lùm xùm sao kê từ thiện 16 tỷ đồng — bài học lớn về trách nhiệm giải trình khi người nổi tiếng kêu gọi quyên góp.",
    summary: "Phóng sự của VTV24 phân tích vụ việc người nổi tiếng kêu gọi từ thiện 16 tỷ đồng và những tranh cãi sao kê sau đó, đặt câu hỏi về trách nhiệm giải trình khi cá nhân đứng ra nhận tiền quyên góp của cộng đồng.",
    body: [
      "Vụ việc '16 tỷ đồng' là case study kinh điển của từ thiện thiếu minh bạch tại Việt Nam: người kêu gọi có thật, hoạt động có thật, nhưng khâu công khai sao kê và giải trình chi tiêu không theo kịp — khiến lòng tin cộng đồng sụt giảm nghiêm trọng.",
      "Sau các vụ việc tương tự, Nghị định 93/2021 ra đời yêu cầu tài khoản riêng và công khai kết quả có thời hạn cho mọi đợt vận động cá nhân.",
      "Video được nhúng trực tiếp từ kênh YouTube chính thức của VTV24; CharityConnect không tải lại nội dung mà điều hướng về nguồn gốc."
    ],
    source: byId["source-vtv24"],
    source_url: "https://www.youtube.com/watch?v=uKHbJyYpW9k",
    source_title: "VTV24 trên YouTube",
    source_published_at: "2025-02-01",
    collected_at: "2026-07-04T00:00:00.000Z",
    updated_at: "2026-07-04T00:00:00.000Z",
    image_url: "/images/veo-charity-02.jpg",
    tags: ["video", "sao kê", "người nổi tiếng"],
    badges: ["Có video", "Nguồn chính thống", "Nhúng từ YouTube"],
    claims: [
      { label: "Số tiền trong vụ việc", value: "16 tỷ đồng", note: "Số tiền quyên góp trong vụ lùm xùm sao kê được phóng sự đề cập." },
      { label: "Bài học chính", value: "Trách nhiệm giải trình", note: "Cá nhân nhận tiền cộng đồng phải công khai sao kê đúng hạn theo Nghị định 93/2021." }
    ],
    media: [
      { type: "VIDEO", url: "https://www.youtube.com/watch?v=uKHbJyYpW9k", thumbnail_url: "/images/veo-charity-02.jpg", title: "Tiêu điểm: khi lòng tốt bị lợi dụng — VTV24", attribution: "VTV24 · YouTube" }
    ],
    score: {
      total: 73,
      grade: "B",
      source_authority: 25,
      financial_evidence: 10,
      legal_identity: 15,
      media_evidence: 15,
      freshness: 8,
      reasons: ["Kênh YouTube chính thức VTV24", "Video còn hoạt động, nhúng được", "Nội dung giáo dục phòng tránh"]
    },
    status: "PUBLISHED"
  },
  {
    id: "article-vtv24-thu-doan",
    slug: "vtv24-thu-doan-lua-dao-keu-goi-tu-thien",
    type: "VIDEO",
    title: "Thủ đoạn lừa đảo chiếm đoạt tài sản bằng cách kêu gọi từ thiện",
    excerpt: "Phóng sự VTV24 bóc tách cách các đối tượng dựng hoàn cảnh khó khăn giả trên mạng xã hội để kêu gọi quyên góp rồi chiếm đoạt.",
    summary: "Phóng sự của VTV24 ghi nhận thủ đoạn đăng tải hoàn cảnh khó khăn không có thật trên mạng xã hội để kêu gọi quyên góp từ thiện, sau đó chiếm đoạt tiền ủng hộ của cộng đồng — cùng khuyến cáo xác minh của cơ quan chức năng.",
    body: [
      "Kịch bản chung của dạng lừa đảo này: hình ảnh thương tâm (thường lấy lại từ nguồn khác), câu chuyện gấp gáp, và một số tài khoản cá nhân nhận tiền. Video giúp người xem nhận diện từng dấu hiệu.",
      "Điểm nhấn của phóng sự là các nạn nhân hầu như không thể đòi lại tiền: giao dịch chuyển khoản tự nguyện rất khó thu hồi, nên phòng tránh trước khi chuyển là cách bảo vệ duy nhất.",
      "Video được nhúng từ kênh YouTube chính thức của VTV24 kèm link về nguồn gốc."
    ],
    source: byId["source-vtv24"],
    source_url: "https://www.youtube.com/watch?v=n1TN1AuvjiI",
    source_title: "VTV24 trên YouTube",
    source_published_at: "2024-04-01",
    collected_at: "2026-07-04T00:00:00.000Z",
    updated_at: "2026-07-04T00:00:00.000Z",
    image_url: "/images/veo-charity-05.jpg",
    tags: ["video", "thủ đoạn", "cảnh báo"],
    badges: ["Có video", "Nguồn chính thống", "Nhúng từ YouTube"],
    claims: [
      { label: "Thủ đoạn", value: "Hoàn cảnh giả + tài khoản cá nhân", note: "Dựng câu chuyện thương tâm không có thật để kêu gọi chuyển tiền." },
      { label: "Khả năng thu hồi", value: "Rất thấp", note: "Chuyển khoản tự nguyện khó đòi lại — phòng tránh trước khi chuyển là chính." }
    ],
    media: [
      { type: "VIDEO", url: "https://www.youtube.com/watch?v=n1TN1AuvjiI", thumbnail_url: "/images/veo-charity-05.jpg", title: "Thủ đoạn lừa đảo kêu gọi từ thiện — VTV24", attribution: "VTV24 · YouTube" }
    ],
    score: {
      total: 71,
      grade: "B",
      source_authority: 25,
      financial_evidence: 8,
      legal_identity: 15,
      media_evidence: 15,
      freshness: 8,
      reasons: ["Kênh YouTube chính thức VTV24", "Video còn hoạt động, nhúng được", "Bóc tách thủ đoạn cụ thể"]
    },
    status: "PUBLISHED"
  }
];

function buildKpis(articles: ContentArticle[] = contentArticles): ContentKpiSummary {
  const grade_distribution = articles.reduce<Record<TrustGrade, number>>((acc, article) => {
    acc[article.score.grade] += 1;
    return acc;
  }, { A: 0, B: 0, C: 0, D: 0, X: 0 });
  const published = articles.filter((article) => article.status === "PUBLISHED");
  const withEvidence = published.filter((article) => article.claims.length > 0 && article.media.length > 0).length;
  return {
    sources_total: contentSources.length,
    official_articles: published.filter((article) => ["A", "B"].includes(article.source.level)).length,
    alert_cases: published.filter((article) => article.type === "ALERT").length,
    evidence_rate: Math.round((withEvidence / Math.max(1, published.length)) * 100),
    live_source_rate: 100,
    updated_30d: published.length,
    original_clicks: 1284,
    article_count: published.length,
    grade_distribution
  };
}

export const contentKpis = buildKpis();

export const contentHomeSeed: ContentHome = {
  hero: {
    title: "Kiểm chứng trước khi quyên góp",
    subtitle: "CharityConnect tổng hợp nguồn chính thống, báo cáo minh bạch và cảnh báo dấu hiệu từ thiện giả để bảo vệ lòng tốt của cộng đồng.",
    primary_cta: "Tra cứu ngay",
    secondary_cta: "Xem cảnh báo"
  },
  kpis: contentKpis,
  featured: contentArticles.filter((article) => ["ORGANIZATION", "TRANSPARENCY", "DATA"].includes(article.type)),
  alerts: contentArticles.filter((article) => article.type === "ALERT"),
  videos: contentArticles.filter((article) => article.type === "VIDEO"),
  sources: contentSources
};
