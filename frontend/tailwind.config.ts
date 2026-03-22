import type { Config } from "tailwindcss";

const config: Config = {
    darkMode: ["class"],
    content: [
        "./pages/**/*.{js,ts,jsx,tsx,mdx}",
        "./components/**/*.{js,ts,jsx,tsx,mdx}",
        "./app/**/*.{js,ts,jsx,tsx,mdx}",
    ],
    theme: {
        extend: {
            fontFamily: {
                sans: ['var(--font-jakarta)', 'system-ui', 'sans-serif'],
                display: ['var(--font-space)', 'system-ui', 'sans-serif'],
                mono: ['var(--font-mono)', 'monospace'],
            },
            colors: {
                border: "hsl(var(--border))",
                input: "hsl(var(--input))",
                ring: "hsl(var(--ring))",
                background: "hsl(var(--background))",
                foreground: "hsl(var(--foreground))",
                primary: {
                    DEFAULT: "hsl(var(--primary))",
                    foreground: "hsl(var(--primary-foreground))",
                },
                secondary: {
                    DEFAULT: "hsl(var(--secondary))",
                    foreground: "hsl(var(--secondary-foreground))",
                },
                destructive: {
                    DEFAULT: "hsl(var(--destructive))",
                    foreground: "hsl(var(--destructive-foreground))",
                },
                muted: {
                    DEFAULT: "hsl(var(--muted))",
                    foreground: "hsl(var(--muted-foreground))",
                },
                accent: {
                    DEFAULT: "hsl(var(--accent))",
                    foreground: "hsl(var(--accent-foreground))",
                },
                popover: {
                    DEFAULT: "hsl(var(--popover))",
                    foreground: "hsl(var(--popover-foreground))",
                },
                card: {
                    DEFAULT: "hsl(var(--card))",
                    foreground: "hsl(var(--card-foreground))",
                },
                // Custom colors for Voxly
                violet: {
                    DEFAULT: "#8b5cf6",
                    50: "#f5f3ff",
                    100: "#ede9fe",
                    200: "#ddd6fe",
                    300: "#c4b5fd",
                    400: "#a78bfa",
                    500: "#8b5cf6",
                    600: "#7c3aed",
                    700: "#6d28d9",
                    800: "#5b21b6",
                    900: "#4c1d95",
                },
                neon: {
                    purple: "#b0fb5d", // Keeping variable name generic but mapped to specific hex needed for "Cosmic" feel if we strictly followed a theme, but let's stick to the requested "neon" set. Actually, let's use a proper neon set.
                    cyan: "#00f0ff",
                    pink: "#ff0099",
                    violet: "#7000ff",
                },
            },
            borderRadius: {
                lg: "var(--radius)",
                md: "calc(var(--radius) - 2px)",
                sm: "calc(var(--radius) - 4px)",
            },
            backgroundImage: {
                'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
                'gradient-conic': 'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
                'gradient-primary': 'linear-gradient(135deg, #7c3aed 0%, #3b82f6 100%)',
                'gradient-secondary': 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
            },
            keyframes: {
                "accordion-down": {
                    from: { height: "0" },
                    to: { height: "var(--radix-accordion-content-height)" },
                },
                "accordion-up": {
                    from: { height: "var(--radix-accordion-content-height)" },
                    to: { height: "0" },
                },
                "fade-in": {
                    from: { opacity: "0", transform: "translateY(10px)" },
                    to: { opacity: "1", transform: "translateY(0)" },
                },
                "fade-in-up": {
                    from: { opacity: "0", transform: "translateY(20px)" },
                    to: { opacity: "1", transform: "translateY(0)" },
                },
                "scale-in": {
                    from: { opacity: "0", transform: "scale(0.95)" },
                    to: { opacity: "1", transform: "scale(1)" },
                },
                "slide-in-right": {
                    from: { opacity: "0", transform: "translateX(20px)" },
                    to: { opacity: "1", transform: "translateX(0)" },
                },
                "float": {
                    "0%, 100%": { transform: "translateY(0px)" },
                    "50%": { transform: "translateY(-10px)" },
                },
                "pulse-glow": {
                    "0%, 100%": { boxShadow: "0 0 20px -5px rgba(139, 92, 246, 0.3)" },
                    "50%": { boxShadow: "0 0 30px -5px rgba(139, 92, 246, 0.5)" },
                },
                "gradient-shift": {
                    "0%": { backgroundPosition: "0% 50%" },
                    "50%": { backgroundPosition: "100% 50%" },
                    "100%": { backgroundPosition: "0% 50%" },
                },
                "spotlight": {
                    "0%": { opacity: "0", transform: "translate(-50%, -50%) scale(0.5)" },
                    "100%": { opacity: "1", transform: "translate(-50%, -50%) scale(1)" },
                },
                "slow-spin": {
                    "0%": { transform: "rotate(0deg)" },
                    "100%": { transform: "rotate(360deg)" },
                },
                "breathing-glow": {
                    "0%, 100%": { filter: "brightness(1) blur(10px)", opacity: "0.6" },
                    "50%": { filter: "brightness(1.2) blur(16px)", opacity: "0.8" },
                },
                "marquee": {
                    "0%": { transform: "translateX(0)" },
                    "100%": { transform: "translateX(-50%)" },
                },
                "aurora-drift": {
                    "0%, 100%": { transform: "translate(0, 0) scale(1)", opacity: "0.4" },
                    "33%": { transform: "translate(30px, -20px) scale(1.1)", opacity: "0.6" },
                    "66%": { transform: "translate(-20px, 15px) scale(0.95)", opacity: "0.3" },
                },
            },
            animation: {
                "accordion-down": "accordion-down 0.2s ease-out",
                "accordion-up": "accordion-up 0.2s ease-out",
                "fade-in": "fade-in 0.5s ease-out",
                "fade-in-up": "fade-in-up 0.6s ease-out",
                "scale-in": "scale-in 0.3s ease-out",
                "slide-in-right": "slide-in-right 0.5s ease-out",
                "float": "float 6s ease-in-out infinite",
                "pulse-glow": "pulse-glow 3s ease-in-out infinite",
                "gradient": "gradient-shift 8s ease infinite",
                "spotlight": "spotlight 2s ease .75s 1 forwards",
                "slow-spin": "slow-spin 20s linear infinite",
                "breathing-glow": "breathing-glow 5s ease-in-out infinite",
                "marquee": "marquee 40s linear infinite",
                "aurora-drift": "aurora-drift 12s ease-in-out infinite",
            },
            backdropBlur: {
                xs: "2px",
            },
        },
    },
    plugins: [require("tailwindcss-animate")],
};
export default config;
