/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        theme: {
          base: "var(--theme-base)",
          surface: "var(--theme-surface)",
          "surface-2": "var(--theme-surface-2)",
          border: "var(--theme-border)",
          text: "var(--theme-text)",
          "text-secondary": "var(--theme-text-secondary)",
          "text-muted": "var(--theme-text-muted)",
        },
      },
    },
  },
  plugins: [],
}
