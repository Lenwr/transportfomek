/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],

  theme: {
    extend: {
      screens: {
        'mobile': {'max': '639px'},     // Écran extra-petit (max-width: 639px)
        'tablette': {'min': '640px', 'max': '767px'},  // Écran petit (min-width: 640px, max-width: 767px)
        'desktop': {'min': '767px', 'max': '1279px'}, // Écran moyen (min-width: 768px, max-width: 1023px)
             // Écran extra-large (min-width: 1280px)
      },
    },
  },
  plugins: [
    require("daisyui"),
  ],
  daisyui: {
    themes: [
      {
        main: {

          "primary": "#176B8A",

          "secondary":"#0B3F5D" ,

          "tertio" : "#DC2626" ,

          "accent": "#35A7C7",

          "neutral": "#172033",

          "base-100": "#FFFFFF",

          "info": "#176B8A",

          "success": "#16A34A",

          "warning": "#F59E0B",

          "error": "#DC2626",
        },
      },
    ],
  },


}
