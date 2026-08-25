import type * as Monaco from "monaco-editor";

/**
 * Keyword + snippet completions for the languages Monaco has no language
 * service for.
 *
 * Monaco ships real IntelliSense only for TypeScript/JavaScript (it runs
 * `tsserver` in a worker). For everything else it has a *tokenizer* — enough
 * to colour the code, but it knows nothing about what may be typed next, so
 * the only suggestions are the word-based ones Monaco scrapes out of the
 * current buffer. That means a fresh file offers nothing at all.
 *
 * These providers fill that gap with a static list per language. They are
 * deliberately dumb — no scope analysis, no type inference, no header
 * parsing — because the alternative (a real language server over WASM) is a
 * different feature at a different order of magnitude of complexity. The
 * word-based suggestions still run alongside these and cover identifiers
 * the user has already typed.
 *
 * TS/JS are deliberately absent: their language service already produces
 * better, scope-aware versions of everything here, and a second flat list
 * layered on top would only add duplicates.
 */

/** Languages Monaco has no language service for. Keyed by the same ids
 * `FloatingEditor`'s `Language` union uses. */
const KEYWORDS: Record<string, string[]> = {
  cpp: [
    "alignas", "alignof", "auto", "bool", "break", "case", "catch", "char", "class",
    "const", "constexpr", "const_cast", "continue", "decltype", "default", "delete",
    "do", "double", "dynamic_cast", "else", "enum", "explicit", "export", "extern",
    "false", "float", "for", "friend", "goto", "if", "inline", "int", "long",
    "mutable", "namespace", "new", "noexcept", "nullptr", "operator", "private",
    "protected", "public", "reinterpret_cast", "return", "short", "signed",
    "sizeof", "static", "static_assert", "static_cast", "struct", "switch",
    "template", "this", "throw", "true", "try", "typedef", "typename", "union",
    "unsigned", "using", "virtual", "void", "volatile", "while",
    // The corner of the standard library that actually shows up in the kind of
    // data-structure code this editor exists to trace.
    "std", "string", "vector", "map", "unordered_map", "set", "unordered_set",
    "pair", "queue", "deque", "stack", "priority_queue", "shared_ptr",
    "unique_ptr", "make_shared", "make_unique", "size_t", "printf", "cout",
    "cin", "endl", "push_back", "emplace_back", "pop_back", "begin", "end",
    "size", "empty", "sort", "swap", "move",
  ],
  python: [
    "and", "as", "assert", "async", "await", "break", "class", "continue", "def",
    "del", "elif", "else", "except", "finally", "for", "from", "global", "if",
    "import", "in", "is", "lambda", "None", "nonlocal", "not", "or", "pass",
    "raise", "return", "True", "False", "try", "while", "with", "yield",
    "self", "print", "len", "range", "enumerate", "zip", "sorted", "reversed",
    "sum", "min", "max", "abs", "int", "str", "float", "bool", "list", "dict",
    "set", "tuple", "append", "pop", "items", "keys", "values",
  ],
  rust: [
    "as", "async", "await", "break", "const", "continue", "crate", "dyn", "else",
    "enum", "extern", "false", "fn", "for", "if", "impl", "in", "let", "loop",
    "match", "mod", "move", "mut", "pub", "ref", "return", "self", "Self",
    "static", "struct", "super", "trait", "true", "type", "unsafe", "use",
    "where", "while",
    "String", "Vec", "Option", "Some", "None", "Result", "Ok", "Err", "Box",
    "HashMap", "HashSet", "VecDeque", "Rc", "RefCell", "println", "iter",
    "unwrap", "expect", "push", "len", "is_empty", "clone", "take",
  ],
};

/** `${1:name}`-style placeholders — Monaco's snippet syntax; `$0` is where
 * the cursor lands once the user tabs out of the last placeholder. */
const SNIPPETS: Record<string, { label: string; detail: string; body: string }[]> = {
  cpp: [
    { label: "main", detail: "int main() { … }", body: "int main() {\n\t$0\n\treturn 0;\n}" },
    { label: "for", detail: "indexed for loop", body: "for (int ${1:i} = 0; ${1:i} < ${2:n}; ++${1:i}) {\n\t$0\n}" },
    { label: "forr", detail: "range-based for loop", body: "for (${1:auto}& ${2:item} : ${3:container}) {\n\t$0\n}" },
    { label: "while", detail: "while loop", body: "while (${1:condition}) {\n\t$0\n}" },
    { label: "if", detail: "if statement", body: "if (${1:condition}) {\n\t$0\n}" },
    { label: "ife", detail: "if / else", body: "if (${1:condition}) {\n\t$2\n} else {\n\t$0\n}" },
    { label: "struct", detail: "struct definition", body: "struct ${1:Name} {\n\t$0\n};" },
    { label: "class", detail: "class definition", body: "class ${1:Name} {\npublic:\n\t$0\n};" },
    { label: "fn", detail: "function definition", body: "${1:void} ${2:name}(${3}) {\n\t$0\n}" },
    { label: "vector", detail: "std::vector declaration", body: "std::vector<${1:int}> ${2:v};$0" },
    { label: "printf", detail: "printf(…)", body: 'printf("${1:%d}\\n", ${2:value});$0' },
    { label: "cout", detail: "std::cout << …", body: "std::cout << ${1:value} << std::endl;$0" },
    { label: "include", detail: "#include <…>", body: "#include <${1:cstdio}>$0" },
  ],
  python: [
    { label: "def", detail: "function definition", body: "def ${1:name}(${2:args}):\n\t$0" },
    { label: "class", detail: "class definition", body: "class ${1:Name}:\n\tdef __init__(self${2}):\n\t\t$0" },
    { label: "for", detail: "for loop", body: "for ${1:item} in ${2:iterable}:\n\t$0" },
    { label: "fori", detail: "for over range()", body: "for ${1:i} in range(${2:n}):\n\t$0" },
    { label: "while", detail: "while loop", body: "while ${1:condition}:\n\t$0" },
    { label: "if", detail: "if statement", body: "if ${1:condition}:\n\t$0" },
    { label: "ife", detail: "if / else", body: "if ${1:condition}:\n\t$2\nelse:\n\t$0" },
    { label: "main", detail: "__main__ guard", body: 'if __name__ == "__main__":\n\t$0' },
    { label: "print", detail: "print(…)", body: "print(${1:value})$0" },
  ],
  rust: [
    { label: "fn", detail: "function definition", body: "fn ${1:name}(${2}) ${3:-> ()} {\n\t$0\n}" },
    { label: "main", detail: "fn main() { … }", body: "fn main() {\n\t$0\n}" },
    { label: "for", detail: "for loop", body: "for ${1:item} in ${2:iterable} {\n\t$0\n}" },
    { label: "while", detail: "while loop", body: "while ${1:condition} {\n\t$0\n}" },
    { label: "whilel", detail: "while let", body: "while let ${1:Some(x)} = ${2:expr} {\n\t$0\n}" },
    { label: "if", detail: "if expression", body: "if ${1:condition} {\n\t$0\n}" },
    { label: "iflet", detail: "if let", body: "if let ${1:Some(x)} = ${2:expr} {\n\t$0\n}" },
    { label: "match", detail: "match expression", body: "match ${1:expr} {\n\t${2:pattern} => $0,\n}" },
    { label: "struct", detail: "struct definition", body: "struct ${1:Name} {\n\t$0\n}" },
    { label: "impl", detail: "impl block", body: "impl ${1:Name} {\n\t$0\n}" },
    { label: "let", detail: "let binding", body: "let ${1:name} = ${2:value};$0" },
    { label: "println", detail: "println!(…)", body: 'println!("{}", ${1:value});$0' },
  ],
};

/** Monaco is a singleton shared by every editor in the app, so providers
 * registered for one pane are visible to all of them — and registering the
 * same list twice makes every suggestion appear twice. Tracked per monaco
 * instance rather than in a bare boolean so a test or a second bundle with
 * its own monaco isn't silently skipped. */
const registered = new WeakSet<typeof Monaco>();

/**
 * Registers the completion providers above. Safe to call from every
 * editor's `beforeMount` — only the first call for a given monaco instance
 * does anything.
 */
export function registerLatticeCompletions(monaco: typeof Monaco) {
  if (registered.has(monaco)) return;
  registered.add(monaco);

  for (const language of Object.keys(KEYWORDS)) {
    monaco.languages.registerCompletionItemProvider(language, {
      provideCompletionItems(model, position) {
        // Monaco needs the range the suggestion replaces. Without it the
        // insert lands *next to* the prefix already typed ("ve" + "vector"),
        // so anchor every item to the word under the cursor.
        const word = model.getWordUntilPosition(position);
        const range: Monaco.IRange = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };

        const keywords = (KEYWORDS[language] ?? []).map((label) => ({
          label,
          kind: monaco.languages.CompletionItemKind.Keyword,
          insertText: label,
          range,
        }));

        const snippets = (SNIPPETS[language] ?? []).map(({ label, detail, body }) => ({
          label,
          detail,
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: body,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          range,
          // Sorts ahead of the plain keyword of the same name: typing "for"
          // and hitting Tab should scaffold the loop, not just re-type the
          // three characters already on screen.
          sortText: `0${label}`,
        }));

        return { suggestions: [...snippets, ...keywords] };
      },
    });
  }
}
