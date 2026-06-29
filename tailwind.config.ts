import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        gabby: {
          bg: "#0d0d0d",
          card: "#1a1a2e",
          blue: "#1a6fd4",
          green: "#27ae60",
          red: "#c0392b",
          amber: "#d4ac0d",
          border: "#2a2a4e",
          "text-primary": "#ffffff",
          "text-secondary": "#8888cc",
          "text-muted": "#555555",
        },
      },
      borderRadius: {
        card: "12px",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      animation: {
        "pulse-ring": "pulse-ring 2s cubic-bezier(0.455, 0.03, 0.515, 0.955) infinite",
        "waveform": "waveform 1.2s ease-in-out infinite",
      },
      keyframes: {
        "pulse-ring": {
          "0%": { transform: "scale(0.95)", opacity: "0.8" },
          "50%": { transform: "scale(1.05)", opacity: "0.4" },
          "100%": { transform: "scale(0.95)", opacity: "0.8" },
        },
        "waveform": {
          "0%, 100%": { transform: "scaleY(0.3)" },
          "50%": { transform: "scaleY(1)" },
        },
      },
    },
  },
  plugins: [],
};
export default config;
