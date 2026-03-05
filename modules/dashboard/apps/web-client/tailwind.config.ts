import type { Config } from 'tailwindcss'

/**
 * Tailwind Configuration - Dark Tactical Theme
 *
 * Colors extracted from Pencil Design System (DashboardDP.pen)
 * @see plan.md for design reference IDs
 */
const config: Config = {
  darkMode: 'class',
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // High-Contrast Liquid Glass System
        glass: {
          dark: 'rgba(0, 0, 0, 0.80)', // Header glass (bg-black/80)
          darker: 'rgba(17, 24, 39, 0.90)', // Extra dark glass (bg-gray-900/90)
          light: 'rgba(0, 0, 0, 0.40)', // Body glass (bg-black/40)
          border: 'rgba(255, 255, 255, 0.10)', // Glass border (border-white/10)
          hover: 'rgba(255, 255, 255, 0.05)', // Hover state
        },
        // Dark Tactical Theme - Exact Pencil values
        tactical: {
          // Backgrounds
          950: '#0D0D0D', // Primary background (darkest)
          900: '#1A1A1A', // Secondary background
          800: '#2A2A2A', // Card background
          700: '#3A3A3A', // Surface/elevated
          // Borders
          600: '#555555', // Default border
          500: '#333333', // Subtle border
          // Text
          400: '#888888', // Muted text
          300: '#999999', // Tertiary text
          200: '#AAAAAA', // Secondary button text
          100: '#CCCCCC', // Secondary text
          50: '#FFFFFF', // Primary text
        },
        accent: {
          // Primary accent is orange/gold (not cyan!)
          primary: '#8B6F47',
          secondary: '#00ff88', // Success green
          warning: '#FFAA00',
          danger: '#FF0000',
          info: '#6699FF',
        },
        status: {
          // Status colors from Pencil indicators
          online: '#8B6F47', // Orange dot for active/online
          offline: '#555555', // Gray for offline
          warning: '#FFAA00',
          idle: '#888888',
          patrol: '#8B6F47', // Orange for patrol
          alert: '#FF0000', // Red for alert/danger
        },
      },
      fontFamily: {
        sans: ['Inter', 'var(--font-inter)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-jetbrains-mono)', 'JetBrains Mono', 'monospace'],
      },
      fontSize: {
        // Pencil typography scale
        'pencil-xs': ['5px', { lineHeight: '1.2', letterSpacing: '0.3px' }],
        'pencil-sm': ['6px', { lineHeight: '1.2', letterSpacing: '0.3px' }],
        'pencil-base': ['7px', { lineHeight: '1.3', letterSpacing: '0.5px' }],
        'pencil-md': ['9px', { lineHeight: '1.3', letterSpacing: '1px' }],
        'pencil-lg': ['11px', { lineHeight: '1.3', letterSpacing: '1px' }],
      },
      borderRadius: {
        pencil: '2px',
      },
      boxShadow: {
        tactical: '0 4px 6px -1px rgba(0, 0, 0, 0.5), 0 2px 4px -1px rgba(0, 0, 0, 0.3)',
        'tactical-lg': '0 10px 15px -3px rgba(0, 0, 0, 0.6), 0 4px 6px -2px rgba(0, 0, 0, 0.4)',
        'glow-orange': '0 0 20px rgba(139, 111, 71, 0.3)',
        'glow-green': '0 0 20px rgba(0, 255, 136, 0.3)',
        'glow-red': '0 0 20px rgba(255, 0, 0, 0.3)',
        glass: '0 4px 30px rgba(0, 0, 0, 0.3)',
        'glass-lg': '0 8px 32px rgba(0, 0, 0, 0.5)',
      },
      backdropBlur: {
        glass: '12px',
        'glass-lg': '20px',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'ping-slow': 'ping 2s cubic-bezier(0, 0, 0.2, 1) infinite',
        'radar-scan': 'radar 2s linear infinite',
      },
      keyframes: {
        radar: {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
      },
      backgroundImage: {
        'grid-tactical':
          'linear-gradient(rgba(85, 85, 85, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(85, 85, 85, 0.1) 1px, transparent 1px)',
      },
      backgroundSize: {
        'grid-tactical': '20px 20px',
      },
    },
  },
  plugins: [],
}

export default config
