const { colors } = require("./app/constants/colors");

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        primary: colors.primary,
        primaryLight: colors.primaryLight,
        secondary: colors.secondary,
        accent: colors.accent,
        danger: colors.danger,
        dangerLight: colors.dangerLight,
        lightGray: colors.lightGray,
        borderGray: colors.borderGray,
        mediumGray: colors.mediumGray,
        darkGray: colors.darkGray,
      },
    },
  },
  plugins: [],
};