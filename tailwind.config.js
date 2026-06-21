/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // 暗色主题:深墨绿
        "nh-dark-bg": "#0F1612",
        "nh-dark-surface": "#16201B",
        "nh-dark-elevated": "#1E2A24",
        "nh-dark-border": "#2A3830",
        "nh-dark-text": "#D4CFC2",
        "nh-dark-text-muted": "#8B9388",
        // 护眼主题:米黄
        "nh-eye-bg": "#F4ECD8",
        "nh-eye-surface": "#EBE2C7",
        "nh-eye-elevated": "#E2D6B5",
        "nh-eye-border": "#D4C599",
        "nh-eye-text": "#3C3327",
        "nh-eye-text-muted": "#7A6E55",
        // 亮色主题:暖白
        "nh-light-bg": "#FAFAF7",
        "nh-light-surface": "#FFFFFF",
        "nh-light-elevated": "#F5F2EC",
        "nh-light-border": "#E5E1D8",
        "nh-light-text": "#1A1714",
        "nh-light-text-muted": "#6B6457",
        // 强调色:琥珀
        "nh-amber": "#E5A55C",
        "nh-amber-bright": "#F0BC7A",
        "nh-amber-dim": "#C28A47",
      },
      fontFamily: {
        serif: ["'Source Han Serif SC'", "'Noto Serif SC'", "'Songti SC'", "STSong", "SimSun", "serif"],
        sans: ["'Source Han Sans SC'", "'Noto Sans SC'", "'PingFang SC'", "Microsoft YaHei", "system-ui", "sans-serif"],
        writing: ["'LXGW WenKai'", "'Source Han Serif SC'", "serif"],
        mono: ["'JetBrains Mono'", "'Cascadia Code'", "Consolas", "monospace"],
      },
    },
  },
  plugins: [],
};
