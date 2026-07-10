import { AlertTriangle, Home, RotateCcw } from "lucide-react";
import { isRouteErrorResponse, Link, useRouteError } from "react-router-dom";

export function RouteErrorPage(): JSX.Element {
  const error = useRouteError();
  const detail = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : "Đã xảy ra lỗi không xác định.";

  return <main className="grid min-h-screen place-items-center bg-sage-100 px-4 py-12">
    <section className="w-full max-w-xl rounded-[2rem] border border-ink/10 bg-white p-7 text-center shadow-card sm:p-10">
      <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-amber-100 text-amber-700"><AlertTriangle size={28} /></span>
      <p className="mt-6 text-xs font-black uppercase tracking-[.15em] text-brand-700">CharityConnect</p>
      <h1 className="mt-2 text-3xl font-black tracking-[-.04em] text-ink">Trang này tạm thời chưa sẵn sàng</h1>
      <p className="mt-3 text-sm leading-6 text-slate-600">Dữ liệu chưa tải đúng hoặc kết nối API đang gián đoạn. Thông tin của bạn chưa bị mất.</p>
      <p className="mt-4 rounded-2xl bg-sage-100 p-3 text-xs text-slate-500">{detail}</p>
      <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row"><button type="button" className="btn-secondary" onClick={() => window.location.reload()}><RotateCcw size={17} /> Tải lại</button><Link className="btn-primary" to="/"><Home size={17} /> Về trang chủ</Link></div>
    </section>
  </main>;
}
