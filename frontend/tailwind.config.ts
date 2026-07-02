import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
      },
      fontSize: {
        'caption': ['10px', { lineHeight: '1.4', letterSpacing: '0.02em' }],
        'label': ['11px', { lineHeight: '1.5' }],
        'body-sm': ['12px', { lineHeight: '1.6' }],
        'body': ['13px', { lineHeight: '1.6' }],
        'display-sm': ['14px', { lineHeight: '1.4' }],
        'display': ['22px', { lineHeight: '1.2', letterSpacing: '-0.01em' }],
      },
    },
  },
  plugins: [],
};
export default config;
