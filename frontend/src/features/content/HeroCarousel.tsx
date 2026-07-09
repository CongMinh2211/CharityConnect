import { useCallback, useEffect, useRef, useState } from "react";

interface Slide {
  image: string;
  eyebrow: string;
  title: string;
  subtitle: string;
}

const SLIDES: Slide[] = [
  { image: "/images/veo-charity-hero.jpg", eyebrow: "Kiểm chứng", title: "Trao đi đúng nơi, đúng nguồn", subtitle: "Đối chiếu nguồn chính thống trước khi quyên góp." },
  { image: "/images/education.jpg", eyebrow: "Dự án thật", title: "Bữa trưa cho trẻ vùng cao", subtitle: "Số liệu công bố kèm nguồn, có thể tra cứu." },
  { image: "/images/community.jpg", eyebrow: "Cộng đồng", title: "Cùng nhau giám sát minh bạch", subtitle: "Mọi đóng góp đều để lại bằng chứng công khai." },
  { image: "/images/medical-support.jpg", eyebrow: "TrustChain", title: "Minh bạch tới từng đồng", subtitle: "Biên nhận và sổ cái không thể chỉnh sửa." },
];

const INTERVAL = 4800;

// Carousel dựng theo cấu trúc Bootstrap (carousel / carousel-item / carousel-control-*)
// nhưng điều khiển bằng React state để chạy ổn định trong SPA React (không cần bootstrap.bundle.js).
export function HeroCarousel(): JSX.Element {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const timer = useRef<number | null>(null);

  const go = useCallback((next: number) => setActive((next + SLIDES.length) % SLIDES.length), []);

  useEffect(() => {
    if (paused) return;
    timer.current = window.setTimeout(() => go(active + 1), INTERVAL);
    return () => { if (timer.current) window.clearTimeout(timer.current); };
  }, [active, paused, go]);

  return (
    <div
      className="carousel slide relative mx-auto w-full max-w-[600px] overflow-hidden rounded-[2.2rem] shadow-photo"
      role="region"
      aria-roledescription="carousel"
      aria-label="Hình ảnh hoạt động thiện nguyện"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="carousel-inner relative aspect-[4/3] bg-ink">
        {SLIDES.map((slide, index) => (
          <div
            key={slide.image}
            className={`carousel-item absolute inset-0 transition-opacity duration-700 ease-out ${index === active ? "opacity-100" : "pointer-events-none opacity-0"}`}
            aria-hidden={index !== active}
          >
            <img src={slide.image} alt={slide.title} className="h-full w-full object-cover" loading={index === 0 ? "eager" : "lazy"} />
            <div className="absolute inset-0 bg-gradient-to-t from-ink/85 via-ink/20 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-6 sm:p-8">
              <span className="inline-flex rounded-full bg-brand-500 px-3 py-1 text-xs font-black uppercase tracking-[.15em] text-ink">{slide.eyebrow}</span>
              <h3 className="mt-3 text-2xl font-black leading-tight text-white sm:text-3xl">{slide.title}</h3>
              <p className="mt-1 text-sm text-white/80">{slide.subtitle}</p>
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        className="carousel-control-prev absolute left-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/85 text-ink shadow-lg transition hover:bg-white hover:scale-105"
        onClick={() => go(active - 1)}
        aria-label="Ảnh trước"
      >
        <i className="bi bi-chevron-left text-lg" aria-hidden="true" />
      </button>
      <button
        type="button"
        className="carousel-control-next absolute right-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/85 text-ink shadow-lg transition hover:bg-white hover:scale-105"
        onClick={() => go(active + 1)}
        aria-label="Ảnh tiếp theo"
      >
        <i className="bi bi-chevron-right text-lg" aria-hidden="true" />
      </button>

      <div className="carousel-indicators absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-2">
        {SLIDES.map((slide, index) => (
          <button
            key={slide.image}
            type="button"
            className={`h-2 rounded-full transition-all ${index === active ? "w-7 bg-brand-500" : "w-2 bg-white/60 hover:bg-white"}`}
            onClick={() => go(index)}
            aria-label={`Chuyển đến ảnh ${index + 1}`}
            aria-current={index === active}
          />
        ))}
      </div>
    </div>
  );
}
