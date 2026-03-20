import type { Config } from "tailwindcss";

export default {
  darkMode: "class",
    content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
  	extend: {
  		colors: {
  			background: 'var(--background)',
  			foreground: 'var(--foreground)',
  			card: {
  				DEFAULT: 'var(--card)',
  				foreground: 'var(--card-foreground)',
  			},
  			popover: {
  				DEFAULT: 'var(--popover)',
  				foreground: 'var(--popover-foreground)',
  			},
  			primary: {
  				DEFAULT: 'var(--primary)',
  				foreground: 'var(--primary-foreground)',
  			},
  			secondary: {
  				DEFAULT: 'var(--secondary)',
  				foreground: 'var(--secondary-foreground)',
  			},
  			muted: {
  				DEFAULT: 'var(--muted)',
  				foreground: 'var(--muted-foreground)',
  			},
  			accent: {
  				DEFAULT: 'var(--accent)',
  				foreground: 'var(--accent-foreground)',
  			},
  			destructive: {
  				DEFAULT: 'var(--destructive)',
  				foreground: 'var(--destructive-foreground)',
  			},
  			positive: {
  				DEFAULT: 'var(--positive)',
  				foreground: 'var(--positive-foreground)',
  			},
  			border: 'var(--border)',
  			input: 'var(--input)',
  			ring: 'var(--ring)',
  			chart: {
  				'1': 'var(--chart-1)',
  				'2': 'var(--chart-2)',
  				'3': 'var(--chart-3)',
  				'4': 'var(--chart-4)',
  				'5': 'var(--chart-5)',
  			},
  			pink: {
  				50: 'var(--pink-50)',
  				100: 'var(--pink-100)',
  				200: 'var(--pink-200)',
  				500: 'var(--pink-500)',
  				600: 'var(--pink-600)',
  				700: 'var(--pink-700)',
  			},
  			yellow: {
  				50: 'var(--yellow-50)',
  				100: 'var(--yellow-100)',
  				200: 'var(--yellow-200)',
  				400: 'var(--yellow-400)',
  				600: 'var(--yellow-600)',
  				700: 'var(--yellow-700)',
  			},
  		},
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)',
  			pill: '9999px',
  			'card-primary': '35px',
  		},
  		boxShadow: {
  			card: '0 2px 8px rgba(0, 0, 0, 0.08)',
  			'card-primary': '0 4px 12px rgba(0, 0, 0, 0.12)',
  			cta: '0 6px 12px rgba(236, 72, 153, 0.3)',
  			accent: '0 10px 20px rgba(180, 83, 9, 0.35)',
  			dropdown: '0 8px 16px rgba(0, 0, 0, 0.1)',
  			drawer: '0 -6px 18px rgba(0, 0, 0, 0.12)',
  			'toast-success': '0 8px 16px rgba(22, 163, 74, 0.3)',
  			'toast-danger': '0 8px 16px rgba(220, 38, 38, 0.3)',
  			'toast-info': '0 8px 16px rgba(15, 23, 42, 0.3)',
  		},
  	},
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
