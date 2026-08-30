import type * as Monaco from "monaco-editor";

/** Monaco's registry name for the theme defined below. Pass it as
 * `<Editor theme={LATTICE_THEME}>` so the editor is *created* dark. */
export const LATTICE_THEME = "lattice-dark";

/** The editor theme, matched to the dashboard's palette. Shared by every
 * Monaco instance in the app (the Visualizer's FloatingEditor and
 * Code-Canvas's generated-code pane) so they can't drift apart — Monaco
 * themes are global, so whichever editor mounts first defines it for all.
 *
 * Call this from `<Editor beforeMount>`, never `onMount`. Monaco builds its
 * DOM with the default `vs` theme — a pure white `rgb(255,255,254)`
 * background — and applying a theme afterwards means one painted frame of
 * white before it flips. `beforeMount` runs ahead of editor creation, so
 * there is no light frame to flash. */
export function defineLatticeTheme(monaco: typeof Monaco) {
  monaco.editor.defineTheme(LATTICE_THEME, {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "comment", foreground: "7d8590", fontStyle: "italic" },
      { token: "keyword", foreground: "b147eb" },
      { token: "string", foreground: "00e5ff" },
      { token: "number", foreground: "fbbf24" },
    ],
    colors: {
      // Fully transparent, so the *container* owns the fill rather than
      // Monaco. Editors on an opaque shell restate `--bg-surface` on their
      // wrapper and look exactly as they did; the Visualizer's floating
      // editor uses `.glass-editor` instead and lets the panel's frost —
      // and the canvas behind it — read through the code.
      // Widget colours below stay opaque on purpose: the suggest popup has
      // to be readable over whatever it covers.
      "editor.background": "#00000000",
      "editor.foreground": "#e6edf3",
      "editorLineNumber.foreground": "#7d859080",
      "editorLineNumber.activeForeground": "#e6edf3",
      "editor.selectionBackground": "#b147eb40",
      "editor.inactiveSelectionBackground": "#b147eb1f",
      "editorCursor.foreground": "#00e5ff",
      "editor.lineHighlightBackground": "#21262d80",
      "editorIndentGuide.background": "#7d859026",
      "editorWidget.background": "#21262d",
      "editorWidget.border": "#7d859033",
      "editorSuggestWidget.background": "#21262d",
      "editorSuggestWidget.border": "#7d859033",
      "editorSuggestWidget.selectedBackground": "#b147eb26",
      "scrollbarSlider.background": "#7d859033",
      "scrollbarSlider.hoverBackground": "#7d859055",
    },
  });
  monaco.editor.setTheme(LATTICE_THEME);
}
