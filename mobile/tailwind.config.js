/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        obsidian: "#090D16",
        surface: "#111827",
        "surface-elevated": "#161F33",
        "surface-card": "#0F1624",
        "input-bg": "#0B111E",
      },
    },
  },
  plugins: [],
};
