import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      // Autorise `const { a, ...reste } = obj` pour retirer des champs d'un objet
      'no-unused-vars': ['error', { ignoreRestSiblings: true }],
      // Recommandation de style (indicateur de chargement mis à jour dans un effet), pas un bug
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
  {
    // Code exécuté par Node (proxy local, fonctions Vercel) : variables globales de Node
    files: ['proxy.js', 'api/**/*.js'],
    languageOptions: { globals: globals.node },
  },
])
