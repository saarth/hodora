import js from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", ".output", ".vinxi"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "server-only",
              message:
                "TanStack Start does not use the Next.js `server-only` package. Rename the module to `*.server.ts` or mark it with `@tanstack/react-start/server-only`.",
            },
          ],
        },
      ],
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", ignoreRestSiblings: true },
      ],
    },
  },
  {
    // These files deliberately type MapLibre's `Map`/layer/filter objects
    // and Overpass's JSON responses as `any` rather than against their
    // exact (and, for MapLibre's expression spec, `as const`-tuple-only)
    // types — see the file-header comments in cycling-style.ts and
    // RouteMap.tsx for why.
    files: ["src/components/RouteMap.tsx", "src/lib/cycling-style.ts", "src/lib/discover.ts"],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
  {
    // Both components write a ref on every render (`fooRef.current = foo`)
    // purely so effects/callbacks can read the latest prop/state without
    // retriggering on every change — the same "keep a ref in sync" idiom
    // already documented with an inline disable in rides.$id.nav.tsx, just
    // too pervasive in these two files for per-line comments to stay
    // readable. `react-hooks/refs` flags every one of those writes as a
    // false positive.
    files: ["src/components/RouteMap.tsx", "src/lib/weather.ts"],
    rules: { "react-hooks/refs": "off" },
  },
  eslintPluginPrettier,
);
