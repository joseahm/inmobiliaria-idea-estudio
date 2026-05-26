/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#17212b",
        muted: "#657382",
        brand: "#0f766e",
        accent: "#2563eb"
      },
      boxShadow: {
        panel: "0 12px 30px rgba(23, 33, 43, 0.08)"
      }
    }
  },
  plugins: []
};
