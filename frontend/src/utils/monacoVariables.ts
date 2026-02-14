import type { Monaco } from "@monaco-editor/react";
import type { VariableGroup, VariableInfo } from "@/hooks/useVariableGroups";
import type { editor, languages, IRange, Position } from "monaco-editor";

type GetVariables = () => { groups: VariableGroup[]; resolved: Map<string, VariableInfo> };

let registered = false;

const VARIABLE_LANGUAGES = ["json", "xml", "plaintext", "python", "javascript"];

export function registerVariableProviders(monaco: Monaco, getVariables: GetVariables) {
  if (registered) return;
  registered = true;

  // ── Custom theme rules for {{variable}} tokens ──
  const variableTokenColor: editor.ITokenThemeRule[] = [
    { token: "variable.template", foreground: "0ea5e9" }, // sky-500
    { token: "variable.template.unresolved", foreground: "ef4444" }, // red-500
  ];

  monaco.editor.defineTheme("vs-dark-variables", {
    base: "vs-dark",
    inherit: true,
    rules: variableTokenColor,
    colors: {},
  });

  monaco.editor.defineTheme("light-variables", {
    base: "vs",
    inherit: true,
    rules: variableTokenColor,
    colors: {},
  });

  // ── Completion Provider ──
  for (const lang of VARIABLE_LANGUAGES) {
    monaco.languages.registerCompletionItemProvider(lang, {
      triggerCharacters: ["{"],
      provideCompletionItems(
        model: editor.ITextModel,
        position: Position,
      ): languages.ProviderResult<languages.CompletionList> {
        const textUntilPosition = model.getValueInRange({
          startLineNumber: position.lineNumber,
          startColumn: 1,
          endLineNumber: position.lineNumber,
          endColumn: position.column,
        });

        // Only trigger after {{
        const match = textUntilPosition.match(/\{\{([^{}]*)$/);
        if (!match) return { suggestions: [] };

        const partialName = (match[1] ?? "").toLowerCase();
        const startCol = position.column - (match[1] ?? "").length;

        const { groups } = getVariables();
        const suggestions: languages.CompletionItem[] = [];

        let sortIndex = 0;
        for (const group of groups) {
          for (const item of group.items) {
            if (partialName && !item.key.toLowerCase().includes(partialName)) continue;
            suggestions.push({
              label: item.key,
              kind: monaco.languages.CompletionItemKind.Variable,
              detail: item.value.length > 50 ? item.value.slice(0, 50) + "..." : item.value,
              documentation: group.source === "environment" ? "Environment" : "Collection",
              insertText: item.key + "}}",
              range: {
                startLineNumber: position.lineNumber,
                startColumn: startCol,
                endLineNumber: position.lineNumber,
                endColumn: position.column,
              } as IRange,
              sortText: String(sortIndex++).padStart(4, "0"),
            });
          }
        }

        return { suggestions };
      },
    });

    // ── Hover Provider ──
    monaco.languages.registerHoverProvider(lang, {
      provideHover(
        model: editor.ITextModel,
        position: Position,
      ): languages.ProviderResult<languages.Hover> {
        const line = model.getLineContent(position.lineNumber);
        const regex = /\{\{([^{}]+)\}\}/g;
        let m;
        while ((m = regex.exec(line)) !== null) {
          const startCol = m.index + 1;
          const endCol = m.index + m[0].length + 1;
          if (position.column >= startCol && position.column <= endCol) {
            const varName = m[1] ?? "";
            const { resolved } = getVariables();
            const info = resolved.get(varName);

            const lines: string[] = [`**\`{{${varName}}}\`**`, ""];
            if (info) {
              lines.push(`**Value:** \`${info.value}\``);
              lines.push(`**Source:** ${info.source === "environment" ? "Environment" : "Collection"}`);
            } else {
              lines.push("*Unresolved variable*");
            }

            return {
              range: {
                startLineNumber: position.lineNumber,
                startColumn: startCol,
                endLineNumber: position.lineNumber,
                endColumn: endCol,
              } as IRange,
              contents: [{ value: lines.join("\n") }],
            };
          }
        }
        return null;
      },
    });
  }
}

/**
 * Returns the correct theme name to use for Monaco editors
 * so that {{variable}} tokens are colored.
 */
export function getVariableTheme(isDark: boolean): string {
  return isDark ? "vs-dark-variables" : "light-variables";
}
