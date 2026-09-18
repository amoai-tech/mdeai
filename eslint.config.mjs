import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const config = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "coverage/**",
      ".mastra/**",
      "dist/**",
      "github/**",
      "CopilotKit/**",
      "commerce/**",
      "docs/**",
      "graphify-out/**",
      ".dependency-cruiser.cjs",
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    // Playwright fixtures receive a `use()` teardown callback. That is not a
    // React hook, so the React Hooks rules do not apply to e2e code — applying
    // them makes every fixture look like a rules-of-hooks violation.
    files: ["e2e/**/*.ts"],
    rules: {
      "react-hooks/rules-of-hooks": "off",
    },
  },
];

export default config;
