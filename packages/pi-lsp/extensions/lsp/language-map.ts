import path from 'node:path';

export const LANGUAGE_EXTENSIONS: Record<string, string> = {
  '.abap': 'abap', '.bat': 'bat', '.bib': 'bibtex', '.clj': 'clojure',
  '.coffee': 'coffeescript', '.c': 'c', '.cpp': 'cpp', '.cxx': 'cpp',
  '.cc': 'cpp', '.c++': 'cpp', '.cs': 'csharp', '.css': 'css',
  '.d': 'd', '.dart': 'dart', '.dockerfile': 'dockerfile',
  '.ex': 'elixir', '.exs': 'elixir', '.erl': 'erlang',
  '.fs': 'fsharp', '.fsi': 'fsharp', '.fsx': 'fsharp',
  '.go': 'go', '.groovy': 'groovy', '.gleam': 'gleam',
  '.hbs': 'handlebars', '.hs': 'haskell',
  '.html': 'html', '.htm': 'html', '.ini': 'ini',
  '.java': 'java', '.js': 'javascript', '.jsx': 'javascriptreact',
  '.json': 'json', '.kt': 'kotlin', '.kts': 'kotlin',
  '.tex': 'latex', '.less': 'less', '.lua': 'lua',
  '.md': 'markdown', '.markdown': 'markdown',
  '.mjs': 'javascript', '.cjs': 'javascript',
  '.mts': 'typescript', '.cts': 'typescript',
  '.objc': 'objective-c', '.objcpp': 'objective-cpp',
  '.pl': 'perl', '.php': 'php', '.prisma': 'prisma',
  '.ps1': 'powershell', '.py': 'python', '.pyi': 'python',
  '.r': 'r', '.rb': 'ruby', '.rake': 'ruby', '.gemspec': 'ruby', '.ru': 'ruby', '.erb': 'erb', '.rs': 'rust',
  '.sass': 'sass', '.scss': 'scss', '.scala': 'scala',
  '.sh': 'shellscript', '.bash': 'shellscript', '.zsh': 'shellscript',
  '.sql': 'sql', '.svelte': 'svelte', '.swift': 'swift',
  '.toml': 'toml', '.ts': 'typescript', '.tsx': 'typescriptreact',
  '.vue': 'vue', '.xml': 'xml', '.yaml': 'yaml', '.yml': 'yaml',
  '.zig': 'zig',
  'makefile': 'makefile', 'Makefile': 'makefile',
};

export function getLanguageId(filePath: string): string {
  const ext = path.extname(filePath);
  const basename = path.basename(filePath);
  return LANGUAGE_EXTENSIONS[ext] ?? LANGUAGE_EXTENSIONS[basename] ?? 'plaintext';
}
