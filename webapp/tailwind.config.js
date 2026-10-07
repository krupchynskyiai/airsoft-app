/** @type {import('tailwindcss').Config} */

// MM14 field palette. The stock Tailwind scales used across the app are
// remapped here, so existing class names (slate/gray/emerald/...) render in
// the new theme without touching every component.
const olive = { // surfaces
  50: "#f3f2ea", 100: "#e6e4d6", 200: "#cdcab4", 300: "#aeaa8c", 400: "#8b876a",
  500: "#6a674f", 600: "#4d4b39", 700: "#36352a", 800: "#25251d", 900: "#191a14", 950: "#10110c",
};
const field = { // warm neutral text
  50: "#f7f6f0", 100: "#eceadf", 200: "#dcd9c8", 300: "#c4c0aa", 400: "#a19d86",
  500: "#7d7a66", 600: "#5f5d4d", 700: "#474537", 800: "#302f25", 900: "#1f1e18", 950: "#14130f",
};
const ranger = { // primary accent: MM14 green, lifted for dark backgrounds
  50: "#f4f6e8", 100: "#e6ebc8", 200: "#d3dc9f", 300: "#bcc97a", 400: "#a3b35a",
  500: "#879945", 600: "#6d7d36", 700: "#56622c", 800: "#434c25", 900: "#363d20", 950: "#1d210f",
};
const khaki = { // secondary accent
  50: "#f8f5ec", 100: "#eee7d1", 200: "#ddd0a8", 300: "#c9b67e", 400: "#b39d5f",
  500: "#9a844a", 600: "#7d6a3c", 700: "#645433", 800: "#50442c", 900: "#433a28", 950: "#251f14",
};
const brass = {
  50: "#fbf6e9", 100: "#f5e8c4", 200: "#ebd28e", 300: "#ddb85e", 400: "#cf9f3e",
  500: "#b6842c", 600: "#956924", 700: "#765222", 800: "#5f4321", 900: "#4f381f", 950: "#2c1e0e",
};
const signal = { // muted red
  50: "#fbf1ee", 100: "#f5ddd6", 200: "#ebbcae", 300: "#de947e", 400: "#cf6c53",
  500: "#b9513a", 600: "#9c3f2e", 700: "#7f3328", 800: "#682c25", 900: "#572822", 950: "#2f1310",
};
const rust = {
  50: "#fbf3ec", 100: "#f4e1cf", 200: "#e8c19c", 300: "#d9a06d", 400: "#c9824b",
  500: "#b0683a", 600: "#90532f", 700: "#744329", 800: "#5e3825", 900: "#4e3022", 950: "#2b1810",
};
const steel = {
  50: "#f1f4f5", 100: "#dfe6e9", 200: "#c2d0d6", 300: "#9fb4bd", 400: "#7f99a4",
  500: "#657f8b", 600: "#516772", 700: "#44545d", 800: "#3a464d", 900: "#333c42", 950: "#1f2529",
};
const plum = {
  50: "#f6f2f4", 100: "#ebe1e7", 200: "#d8c5d0", 300: "#bea3b3", 400: "#a28394",
  500: "#87697a", 600: "#6f5564", 700: "#5c4753", 800: "#4d3d46", 900: "#42363d", 950: "#261d22",
};

export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        slate: olive, zinc: olive, neutral: field, stone: field, gray: field,
        emerald: ranger, green: ranger, lime: ranger, teal: khaki,
        amber: brass, yellow: brass, orange: rust,
        red: signal, rose: signal,
        sky: steel, blue: steel, cyan: steel,
        violet: plum, purple: plum, indigo: plum, fuchsia: plum, pink: plum,
        olive, field, ranger, khaki, brass, signal, rust, steel, plum,
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        display: ["Oswald", '"IBM Plex Sans"', "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "monospace"],
      },
      borderRadius: {
        DEFAULT: "3px", sm: "2px", md: "3px", lg: "4px", xl: "6px", "2xl": "8px", "3xl": "12px",
      },
      transitionTimingFunction: {
        smooth: "cubic-bezier(0.22, 1, 0.36, 1)",
      },
    },
  },
  plugins: [],
};
