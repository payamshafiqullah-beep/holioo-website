export default {
  content: ["./index.html","./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        cream: '#F8F4EF',
        beige: '#EDE8E1',
        taupe: '#C4B8A8',
        stone: '#9B8E7E',
        charcoal: '#2C2825',
        warm: '#6B5E4E',
        gold: '#B8956A',
      },
      fontFamily: {
        serif: ['"Cormorant Garamond"', 'Georgia', 'serif'],
        sans: ['"DM Sans"', 'system-ui', 'sans-serif'],
        display: ['"Cormorant"', 'serif'],
      },
    }
  },
  plugins: []
}
