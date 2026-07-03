import { Link } from "react-router-dom";

const quickLinks = [
  { to: "/", label: "Chiến dịch" },
  { to: "/thong-ke", label: "Thống kê" },
  { to: "/minh-bach", label: "Sổ cái minh bạch" },
  { to: "/xac-minh-bien-nhan", label: "Xác minh biên nhận" }
];

export function NotFoundPage(): JSX.Element {
  return (
    <div className="container-page py-20 text-center">
      <p className="text-6xl font-black text-brand-700">404</p>
      <h1 className="mt-4 text-2xl font-black">Không tìm thấy trang</h1>
      <p className="mx-auto mt-3 max-w-md text-slate-600">Đường dẫn không tồn tại hoặc đã thay đổi. Bạn có thể quay lại hoặc đi tới một trang phổ biến bên dưới.</p>
      <Link className="btn-primary mt-6" to="/">Về trang chiến dịch</Link>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        {quickLinks.map((link) => <Link key={link.to} className="filter-pill" to={link.to}>{link.label}</Link>)}
      </div>
    </div>
  );
}
