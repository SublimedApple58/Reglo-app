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
  			navy: {
  				50: 'var(--navy-50)',
  				100: 'var(--navy-100)',
  				700: 'var(--navy-700)',
  				800: 'var(--navy-800)',
  				900: 'var(--navy-900)',
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
  			card: '0 2px 8px rgba(0, 0, 0, 0.06)',
  			'card-primary': '0 4px 12px rgba(0, 0, 0, 0.08)',
  			panel: 'rgba(0, 0, 0, 0.02) 0 0 0 1px, rgba(0, 0, 0, 0.04) 0 2px 6px 0, rgba(0, 0, 0, 0.1) 0 4px 8px 0',
  			cta: '0 6px 12px rgba(26, 26, 46, 0.18)',
  			accent: '0 10px 20px rgba(26, 26, 46, 0.18)',
  			dropdown: 'rgba(0, 0, 0, 0.14) 0 8px 32px',
  			drawer: '0 -6px 18px rgba(0, 0, 0, 0.12)',
  			'toast-success': '0 8px 16px rgba(22, 163, 74, 0.3)',
  			'toast-danger': '0 8px 16px rgba(220, 38, 38, 0.3)',
  			'toast-info': '0 8px 16px rgba(15, 23, 42, 0.3)',
  		},
  	},
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
