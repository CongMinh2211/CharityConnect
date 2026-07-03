import { Camera } from "lucide-react";
import { useEffect, useRef, useState, type SyntheticEvent } from "react";

interface GalleryImage {
  src: string;
  alt: string;
  fallback: string;
  span?: boolean;
}

const IMAGES: GalleryImage[] = [
  {
    src: "https://images.hcmcpv.org.vn/res/news/2021/05/31-05-2021-de-hoat-dong-tu-thien-xa-hoi-bao-dam-duoc-y-nghia-muc-dich-tot-dep-BAF7A452.jpg",
    alt: "Trao quà cho cộng đồng khó khăn",
    fallback: "/images/community.jpg",
    span: true
  },
  { src: "https://cdn.thuvienphapluat.vn//uploads/tintuc/2022/09/28/lam-tu-thien.jpg", alt: "Chung tay làm thiện nguyện", fallback: "/images/veo-charity-02.jpg" },
  { src: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTi0mh4bjC-Fay9bTuNRRyIPw4I5Iv25CsM0BUktFA4sFPW5jYJ_2hIST1R&s=10", alt: "Hỗ trợ trẻ em vùng cao", fallback: "/images/education.jpg" },
  { src: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQg3qMUrOEB-mEImonrrY7K1WZY_lbl4Oq7KX_XYTieB80ZCeoxym6_mEY&s=10", alt: "Bữa ăn yêu thương", fallback: "/images/food-support.jpg" },
  { src: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQDLvMU9t2epiuUyBJ4YxWKFPxJlPMDxWBKicGUhpcD_QZyy4vCQfYZSpA&s=10", alt: "Chăm sóc sức khỏe cộng đồng", fallback: "/images/medical-support.jpg" }
];

export function CharityGallery(): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.12 }
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  function handleError(event: SyntheticEvent<HTMLImageElement>, fallback: string): void {
    const img = event.currentTarget;
    if (img.src !== window.location.origin + fallback && !img.dataset.fallback) {
      img.dataset.fallback = "1";
      img.src = fallback;
    }
  }

  return (
    <section className="container-page py-14">
      <div className="max-w-2xl">
        <p className="eyebrow"><Camera size={16} /> Khoảnh khắc thiện nguyện</p>
        <h2 className="mt-4 text-3xl font-black tracking-[-.035em] sm:text-4xl">Mỗi đóng góp là một câu chuyện</h2>
        <p className="mt-3 leading-7 text-slate-600">Hình ảnh từ các hoạt động thiện nguyện thực tế trên khắp Việt Nam — nơi mỗi đồng góp trở thành thay đổi có thật.</p>
      </div>
      <div ref={ref} className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {IMAGES.map((image, index) => (
          <figure
            key={image.src}
            className={`gallery-tile group relative overflow-hidden rounded-2xl border border-ink/10 bg-sage-100 shadow-card ${image.span ? "col-span-2 row-span-2" : ""} ${visible ? "animate-fade-up" : "opacity-0"}`}
            style={{ animationDelay: `${index * 90}ms` }}
          >
            <img
              src={image.src}
              alt={image.alt}
              loading="lazy"
              referrerPolicy="no-referrer"
              onError={(event) => handleError(event, image.fallback)}
              className={`w-full object-cover ${image.span ? "h-64 sm:h-full" : "h-40 sm:h-44"}`}
            />
            <figcaption className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/25 to-transparent p-3 text-xs font-bold text-white sm:text-sm">
              {image.alt}
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
