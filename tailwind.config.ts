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
        'wos-bg': '#0A0A0A',
        'wos-card': '#141414',
        'wos-card2': '#1E1E1E',
        'wos-card3': '#282828',
        'wos-border': 'rgba(255,255,255,0.08)',
        'wos-border2': 'rgba(255,255,255,0.14)',
        't1': '#FFFFFF',
        't2': '#CCCCCC',
        't3': '#888888',
        'orange': '#F26E1F',
        'orange2': 'rgba(242,110,31,0.18)',
        'green': '#22C55E',
        'green2': 'rgba(34,197,94,0.15)',
        'blue': '#60A5FA',
        'blue2': 'rgba(96,165,250,0.15)',
        'yellow': '#F59E0B',
        'yellow2': 'rgba(245,158,11,0.15)',
        'red': '#EF4444',
        'red2': 'rgba(239,68,68,0.15)',
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'SF Pro Display', 'Segoe UI', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
export default config;
