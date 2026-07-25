import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    // Canvas games keep the whole world in a single mutable object behind a ref
    // and mutate it in place each frame. That is the point of the design — the
    // world is not render state and must not trigger re-renders. The React
    // Compiler's immutability analysis can't see that, so it flags every
    // `entity.x += ...` in the game loop.
    files: ["components/games/**/*.tsx"],
    rules: {
      "react-hooks/immutability": "off",
    },
  },
  {
    // Progress lives in localStorage, which does not exist during the server
    // render. Reading it in a mount effect and setting state is the correct
    // pattern here: doing it in a useState initializer instead would return
    // different values on server and client and cause a hydration mismatch.
    files: [
      "components/GameShell.tsx",
      "components/PasscodeGate.tsx",
      "components/ProgressStrip.tsx",
      "app/progress/page.tsx",
    ],
    rules: {
      "react-hooks/set-state-in-effect": "off",
    },
  },
]);

export default eslintConfig;
