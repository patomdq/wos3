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
        'wl-ink': '#14110C',
        'wl-ink2': '#1B1610',
        'wl-cream': '#F2ECE0',
        'wl-cream-bright': '#F8F3E9',
        'wl-accent': '#A6855A',
        'wl-accent-soft': '#C7A877',
        't1': '#111111',
        't2': '#666666',
        't3': '#888888',
        'orange': '#A6855A',
        'orange2': 'rgba(166,133,90,0.18)',
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
        sans: ['var(--font-hanken)', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        serif: ['var(--font-marcellus)', 'Georgia', 'serif'],
      },
    },
  },
  plugins: [],
};
export default config;
