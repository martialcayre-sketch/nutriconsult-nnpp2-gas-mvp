import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        background: 'var(--background)',
        // Forme rgb(var(--x-rgb) / <alpha-value>) : indispensable pour que les
        // modificateurs d'opacité (bg-foreground/35, bg-surface/80, bg-muted/40)
        // soient générés — un var() hex les faisait silencieusement disparaître
        // (overlays invisibles, audit visuel 2026-07-22).
        foreground: 'rgb(var(--foreground-rgb) / <alpha-value>)',
        surface: {
          DEFAULT: 'rgb(var(--surface-rgb) / <alpha-value>)',
          foreground: 'var(--surface-foreground)',
          elevated: 'var(--color-surface-elevated)',
        },
        muted: {
          DEFAULT: 'rgb(var(--muted-rgb) / <alpha-value>)',
          foreground: 'var(--muted-foreground)',
        },
        border: 'var(--border)',
        primary: {
          DEFAULT: 'rgb(var(--color-primary-rgb) / <alpha-value>)',
          foreground: 'var(--color-primary-foreground)',
        },
        accent: {
          DEFAULT: 'rgb(var(--color-accent-rgb) / <alpha-value>)',
          foreground: 'var(--color-accent-foreground)',
        },
        // Rail de navigation praticien — toujours sombre, indépendant de
        // data-theme (cf. docs/design-system-d1.md, section « Rail de navigation »).
        rail: {
          DEFAULT: 'var(--rail-background)',
          surface: 'rgb(var(--rail-surface-rgb) / <alpha-value>)',
          foreground: 'var(--rail-foreground)',
          muted: 'var(--rail-muted)',
          'muted-foreground': 'var(--rail-muted-foreground)',
          border: 'var(--rail-border)',
          primary: {
            DEFAULT: 'rgb(var(--rail-primary-rgb) / <alpha-value>)',
            foreground: 'var(--rail-primary-foreground)',
          },
          accent: 'var(--rail-accent)',
          'focus-ring': 'var(--rail-focus-ring)',
        },
        // Palette de marque brute, disponible pour des usages ponctuels
        // en dehors des rôles sémantiques ci-dessus.
        teal: {
          950: 'var(--teal-950)',
          900: 'var(--teal-900)',
          700: 'var(--teal-700)',
          500: 'var(--teal-500)',
          200: 'var(--teal-200)',
        },
        gold: {
          600: 'var(--gold-600)',
          500: 'var(--gold-500)',
          300: 'var(--gold-300)',
        },
        violet: {
          600: 'var(--violet-600)',
          300: 'var(--violet-300)',
        },
        // Palette « la Spirale » (A5-R1) — cf. docs/design-system-d1.md §8.
        night: {
          950: 'var(--night-950)',
          900: 'var(--night-900)',
          800: 'var(--night-800)',
        },
        indigo: {
          600: 'rgb(var(--indigo-600-rgb) / <alpha-value>)',
        },
        mint: {
          600: 'rgb(var(--mint-600-rgb) / <alpha-value>)',
          ink: 'var(--mint-ink)',
        },
        solar: {
          500: 'rgb(var(--solar-500-rgb) / <alpha-value>)',
          ink: 'var(--solar-ink)',
        },
        forest: {
          600: 'rgb(var(--forest-600-rgb) / <alpha-value>)',
        },
        copper: {
          500: 'rgb(var(--copper-500-rgb) / <alpha-value>)',
          ink: 'var(--copper-ink)',
        },
        // Trio catégoriel Corps/Ancrage/Esprit — fixe, indépendant des thèmes.
        viz: {
          corps: 'var(--viz-corps)',
          ancrage: 'var(--viz-ancrage)',
          esprit: 'var(--viz-esprit)',
        },
        status: {
          success: 'rgb(var(--color-status-success-rgb) / <alpha-value>)',
          warning: 'rgb(var(--color-status-warning-rgb) / <alpha-value>)',
          danger: 'rgb(var(--color-status-danger-rgb) / <alpha-value>)',
          info: 'rgb(var(--color-status-info-rgb) / <alpha-value>)',
        },
        focus: {
          ring: 'var(--color-focus-ring)',
        },
      },
      fontFamily: {
        // Rôles typographiques A5-R1 : les valeurs de --font-body /
        // --font-display / --font-mono sont attribuées par thème dans
        // globals.css (praticien : Sora/Instrument Sans/Plex Mono ;
        // patient : Bricolage Grotesque/Albert Sans/Plex Mono).
        sans: ['var(--font-body)', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      // Échelle typographique 5.0 (refonte visuelle, maquette cible
      // 2026-07-18) : la « typo remontée » se fait ici, au niveau des tokens —
      // sm passe de 14 à 15px, xs de 12 à 12.5px. Les paliers intermédiaires
      // text-13/text-14 remplacent les valeurs arbitraires text-[13px]/
      // text-[14px] pour rester pilotables centralement. `metric` porte les
      // valeurs de métriques (32px display).
      fontSize: {
        // Palier bas ajouté le 2026-09-06 avec la fermeture de l'échelle aux
        // valeurs arbitraires : dix sites écrivaient 9 à 11 px en dur, et les
        // remonter tous à `text-2xs` aurait grossi des labels denses (badges
        // capitales, légendes de graphe) de 2,5 px. 10 px leur donne un palier.
        '3xs': ['0.625rem', { lineHeight: '1.3' }], // 10px — badges capitales, légendes denses
        '2xs': ['0.71875rem', { lineHeight: '1.35' }], // 11.5px — statuts, labels de jauge
        xs: ['0.78125rem', { lineHeight: '1.4' }], // 12.5px — eyebrows, labels uppercase
        '13': ['0.8125rem', { lineHeight: '1.45' }], // 13px — chips, mono (heures, sources)
        '14': ['0.875rem', { lineHeight: '1.5' }], // 14px — UI dense (rails, tableaux)
        sm: ['0.9375rem', { lineHeight: '1.5' }], // 15px — nav, boutons, sous-titres
        base: ['1rem', { lineHeight: '1.55' }], // 16px — corps
        metric: ['2rem', { lineHeight: '1.1' }], // 32px — valeurs de métriques
      },
      // Ombres 5.0 : --shadow-card au repos, --shadow-pop au survol/pop-up
      // (tiroirs, cartes actives). Valeurs définies dans globals.css.
      boxShadow: {
        card: 'var(--shadow-card)',
        pop: 'var(--shadow-pop)',
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        DEFAULT: 'var(--radius)',
        lg: 'var(--radius-lg)',
      },
    },
  },
  plugins: [],
};
export default config;
