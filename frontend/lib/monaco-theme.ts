import type * as Monaco from "monaco-editor";

/** The editor theme, matched to the dashboard's palette. Shared by every
 * Monaco instance in the app (the Visualizer's FloatingEditor and
 * Code-Canvas's generated-code pane) so they can't drift apart — Monaco
 * themes are global, so whichever editor mounts first defines it for all. */
export function defineLatticeTheme(monaco: typeof Monaco) {
  monaco.editor.defineTheme("lattice-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "comment", foreground: "7d8590", fontStyle: "italic" },
      { token: "keyword", foreground: "b147eb" },
      { token: "string", foreground: "00e5ff" },
      { token: "number", foreground: "fbbf24" },
    ],
    colors: {
      "editor.background": "#161b22",
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
  monaco.editor.setTheme("lattice-dark");
}
