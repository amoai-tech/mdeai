import type { GenerativeUITheme } from "@copilotkit/react-core/v2/generative-ui";

/**
 * MDE's design tokens for CopilotKit's generated UI.
 *
 * Official theming (https://docs.copilotkit.ai/generative-ui/components/theming)
 * sets `--a2ui-*` variables on every surface. The values below resolve through
 * the app's real tokens, so light and dark mode follow `--card`, `--border`,
 * `--foreground`, `--muted-foreground` and `--radius` without a second palette.
 *
 * A value in this theme wins over the same variable set in CSS.
 */
export const mdeTheme: GenerativeUITheme = {
  "--a2ui-color-accent": "var(--primary)",
  "--a2ui-color-on-accent": "var(--primary-foreground)",
  "--a2ui-color-focus": "var(--ring)",
  "--a2ui-color-panel": "var(--card)",
  "--a2ui-color-surface": "var(--card)",
  "--a2ui-color-surface-secondary": "var(--muted)",
  "--a2ui-color-surface-elevated": "var(--card)",
  "--a2ui-color-text-default": "var(--foreground)",
  "--a2ui-color-text-secondary": "var(--muted-foreground)",
  "--a2ui-color-text-tertiary": "var(--muted-foreground)",
  "--a2ui-color-border-default": "var(--border)",
  "--a2ui-color-border-subtle": "var(--border)",
  "--a2ui-color-border-strong": "var(--border)",
  "--a2ui-color-border-control": "var(--border)",
  "--a2ui-radius-md": "var(--radius)",
  "--a2ui-radius-lg": "var(--radius)",
  "--a2ui-font-family": "var(--font-sans)",
};
