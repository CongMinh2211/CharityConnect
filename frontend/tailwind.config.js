/** @type {import('tailwindcss').Config} */
// Bảng màu xanh lá nguyên bản của CharityConnect.
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#10231d",
        sage: { 50: "#f6f8f3", 100: "#e9eee4", 200: "#d9e3d2" },
        brand: {
          50: "#f1fae9",
          100: "#e0f5cf",
          200: "#c9ecab",
          500: "#a7e86b",
          600: "#6cbf3d",
          700: "#2e7148",
          900: "#173f35",
          950: "#0c2a1e"
        },
        trust: { 50: "#eff6ff", 600: "#2563eb", 700: "#1d4ed8" }
      },
      boxShadow: {
        card: "0 12px 35px rgba(16,35,29,.07)",
        photo: "0 28px 70px rgba(16,35,29,.18)"
      }
    }
  },
  plugins: []
};
