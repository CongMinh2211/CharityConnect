import { Link } from "react-router-dom";

export function NotFoundPage(): JSX.Element {
  return <div className="container-page py-20 text-center"><p className="text-6xl font-black text-brand-700">404</p><h1 className="mt-4 text-2xl font-black">Không tìm thấy trang</h1><Link className="btn-primary mt-6" to="/">Về trang chiến dịch</Link></div>;
}

