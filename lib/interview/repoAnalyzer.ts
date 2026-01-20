import { generateStructuredCompletion, type ChatCompletionMessage } from './openaiClient';
import type { FetchedRepo, RepoAnalysis, FileNode } from '@/types/interview';

interface AnalysisResult {
  mainEntryPoints: string[];
  dependencies: Record<string, string[]>;
  patterns: string[];
  librariesUsed: string[];
  summary: string;
}

export async function analyzeRepository(repo: FetchedRepo): Promise<RepoAnalysis> {
  // Build a condensed representation for the AI
  const fileList = repo.files.map(f => `- ${f.path} (${f.language}, ${f.size} bytes)`).join('\n');

  // Include key files content (limited to avoid token limits)
  const keyFiles = repo.files
    .filter(f => {
      const name = f.path.toLowerCase();
      return (
        name.includes('package.json') ||
        name.includes('requirements.txt') ||
        name.includes('cargo.toml') ||
        name.includes('go.mod') ||
        name.endsWith('readme.md') ||
        name.endsWith('index.ts') ||
        name.endsWith('index.js') ||
        name.endsWith('main.ts') ||
        name.endsWith('main.js') ||
        name.endsWith('app.ts') ||
        name.endsWith('app.js') ||
        name.endsWith('server.ts') ||
        name.endsWith('server.js') ||
        name.includes('/api/') ||
        name.includes('/routes/')
      );
    })
    .slice(0, 15);

  const keyFilesContent = keyFiles
    .map(f => `=== ${f.path} ===\n${f.content.slice(0, 3000)}`)
    .join('\n\n');

  // Sample other important files
  const otherImportantFiles = repo.files
    .filter(f => !keyFiles.includes(f) && (
      f.language === 'typescript' ||
      f.language === 'javascript' ||
      f.language === 'python' ||
      f.language === 'go' ||
      f.language === 'rust'
    ))
    .slice(0, 10)
    .map(f => `=== ${f.path} ===\n${f.content.slice(0, 2000)}`)
    .join('\n\n');

  const messages: ChatCompletionMessage[] = [
    {
      role: 'system',
      content: `You are an expert code analyst. Analyze the repository structure and code to understand:
1. Main entry points and their purposes
2. Dependencies between files and modules
3. Design patterns and architectural patterns used
4. Key libraries and frameworks
5. Overall purpose and architecture

Be thorough and technical. Focus on understanding how the codebase works.`,
    },
    {
      role: 'user',
      content: `Analyze this repository: ${repo.owner}/${repo.name}

FILE STRUCTURE:
${fileList}

KEY FILES:
${keyFilesContent}

OTHER IMPORTANT FILES:
${otherImportantFiles}

Provide a detailed analysis in JSON format:
{
  "mainEntryPoints": ["list of main entry point files with brief descriptions"],
  "dependencies": {
    "file/path.ts": ["list of files it depends on"]
  },
  "patterns": ["list of design patterns and architectural patterns used"],
  "librariesUsed": ["list of key libraries/frameworks with their purposes"],
  "summary": "A thorough 3-5 paragraph summary of the codebase architecture, how it works, and key technical decisions"
}`,
    },
  ];

  const result = await generateStructuredCompletion<AnalysisResult>(messages, {
    temperature: 0.3,
    maxTokens: 4096,
  });

  // Build file contents map
  const fileContents: Record<string, string> = {};
  for (const file of repo.files) {
    fileContents[file.path] = file.content;
  }

  return {
    structure: repo.structure,
    mainEntryPoints: result.mainEntryPoints,
    dependencies: result.dependencies,
    patterns: result.patterns,
    librariesUsed: result.librariesUsed,
    summary: result.summary,
    analyzedAt: Date.now(),
    fileContents,
  };
}

export function getFileContent(analysis: RepoAnalysis, filePath: string): string | null {
  return analysis.fileContents[filePath] || null;
}

export function findRelatedFiles(
  analysis: RepoAnalysis,
  filePath: string,
  maxDepth: number = 2
): string[] {
  const related = new Set<string>();
  const visited = new Set<string>();

  function traverse(path: string, depth: number): void {
    if (depth > maxDepth || visited.has(path)) return;
    visited.add(path);

    const deps = analysis.dependencies[path];
    if (deps) {
      for (const dep of deps) {
        related.add(dep);
        traverse(dep, depth + 1);
      }
    }

    // Also find reverse dependencies
    for (const [file, deps] of Object.entries(analysis.dependencies)) {
      if (deps.includes(path)) {
        related.add(file);
        if (depth < maxDepth) {
          traverse(file, depth + 1);
        }
      }
    }
  }

  traverse(filePath, 0);
  related.delete(filePath);

  return Array.from(related);
}

export function getDirectoriesFromStructure(structure: FileNode[]): string[] {
  const directories: string[] = [];

  function traverse(nodes: FileNode[]): void {
    for (const node of nodes) {
      if (node.type === 'directory') {
        directories.push(node.path);
        if (node.children) {
          traverse(node.children);
        }
      }
    }
  }

  traverse(structure);
  return directories;
}
