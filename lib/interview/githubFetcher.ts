import { Octokit } from '@octokit/rest';
import { getNextGitHubToken } from '@/lib/githubTokens';
import type { FetchedRepo, FileNode, RepoFile } from '@/types/interview';

const MAX_FILE_SIZE = 100000; // 100KB per file
const EXCLUDE_DIRS = [
  'node_modules', '.git', 'dist', 'build', '.next', 'venv',
  '__pycache__', '.venv', 'target', 'bin', 'obj', 'coverage',
  '.cache', '.husky', '.vscode', '.idea'
];
const BINARY_EXTENSIONS = [
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.woff', '.woff2',
  '.ttf', '.eot', '.pdf', '.zip', '.tar', '.gz', '.exe', '.dll',
  '.so', '.dylib', '.mp3', '.mp4', '.wav', '.webp', '.bmp'
];

export function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  try {
    const urlObj = new URL(url);
    if (urlObj.hostname !== 'github.com' && urlObj.hostname !== 'www.github.com') {
      return null;
    }
    const parts = urlObj.pathname.split('/').filter(Boolean);
    if (parts.length >= 2) {
      return { owner: parts[0], repo: parts[1].replace(/\.git$/, '') };
    }
    return null;
  } catch {
    return null;
  }
}

function getLanguageFromPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase();
  const languageMap: Record<string, string> = {
    ts: 'typescript',
    tsx: 'tsx',
    js: 'javascript',
    jsx: 'jsx',
    py: 'python',
    rb: 'ruby',
    go: 'go',
    rs: 'rust',
    java: 'java',
    kt: 'kotlin',
    swift: 'swift',
    c: 'c',
    cpp: 'cpp',
    h: 'c',
    hpp: 'cpp',
    cs: 'csharp',
    php: 'php',
    html: 'html',
    css: 'css',
    scss: 'scss',
    sass: 'sass',
    less: 'less',
    json: 'json',
    yaml: 'yaml',
    yml: 'yaml',
    xml: 'xml',
    md: 'markdown',
    sql: 'sql',
    sh: 'bash',
    bash: 'bash',
    zsh: 'bash',
    dockerfile: 'dockerfile',
    makefile: 'makefile',
    vue: 'vue',
    svelte: 'svelte',
  };
  return languageMap[ext || ''] || 'text';
}

function shouldIncludeFile(path: string): boolean {
  const pathParts = path.split('/');

  // Check if any part of the path is in exclude dirs
  if (pathParts.some(part => EXCLUDE_DIRS.includes(part))) {
    return false;
  }

  // Check for binary extensions
  const fileName = pathParts[pathParts.length - 1].toLowerCase();
  if (BINARY_EXTENSIONS.some(ext => fileName.endsWith(ext))) {
    return false;
  }

  // Skip hidden files (except important config files)
  const importantHiddenFiles = ['.env.example', '.gitignore', '.eslintrc', '.prettierrc'];
  if (fileName.startsWith('.') && !importantHiddenFiles.some(f => fileName.startsWith(f.replace('.', '')))) {
    return false;
  }

  return true;
}

function buildFileTree(files: RepoFile[]): FileNode[] {
  const root: FileNode[] = [];
  const dirMap = new Map<string, FileNode>();

  // Sort files by path for consistent ordering
  const sortedFiles = [...files].sort((a, b) => a.path.localeCompare(b.path));

  for (const file of sortedFiles) {
    const parts = file.path.split('/');
    let currentPath = '';
    let currentLevel = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isFile = i === parts.length - 1;
      currentPath = currentPath ? `${currentPath}/${part}` : part;

      if (isFile) {
        currentLevel.push({
          path: file.path,
          name: part,
          type: 'file',
          language: file.language,
          size: file.size,
        });
      } else {
        let dirNode = dirMap.get(currentPath);
        if (!dirNode) {
          dirNode = {
            path: currentPath,
            name: part,
            type: 'directory',
            children: [],
          };
          dirMap.set(currentPath, dirNode);
          currentLevel.push(dirNode);
        }
        currentLevel = dirNode.children!;
      }
    }
  }

  return root;
}

export async function fetchRepository(
  repoUrl: string,
  selectedDirectories?: string[]
): Promise<FetchedRepo> {
  const parsed = parseGitHubUrl(repoUrl);
  if (!parsed) {
    throw new Error('Invalid GitHub URL');
  }

  const { owner, repo } = parsed;
  const token = getNextGitHubToken();
  const octokit = new Octokit({ auth: token });

  // Get repo info
  const { data: repoData } = await octokit.repos.get({ owner, repo });
  const defaultBranch = repoData.default_branch;

  const files: RepoFile[] = [];

  async function fetchDirectory(path: string = ''): Promise<void> {
    // Check if we should process this directory
    if (selectedDirectories && selectedDirectories.length > 0) {
      const shouldProcess = selectedDirectories.some(dir => {
        const normalizedDir = dir.replace(/^\/|\/$/g, '');
        const normalizedPath = path.replace(/^\/|\/$/g, '');
        return normalizedPath === '' ||
               normalizedPath.startsWith(normalizedDir) ||
               normalizedDir.startsWith(normalizedPath);
      });
      if (!shouldProcess && path !== '') {
        return;
      }
    }

    try {
      const { data } = await octokit.repos.getContent({
        owner,
        repo,
        path: path || '',
        ref: defaultBranch,
      });

      if (Array.isArray(data)) {
        for (const item of data) {
          if (!shouldIncludeFile(item.path)) {
            continue;
          }

          if (item.type === 'file') {
            // Check file size
            if (item.size && item.size > MAX_FILE_SIZE) {
              continue;
            }

            try {
              const { data: fileData } = await octokit.repos.getContent({
                owner,
                repo,
                path: item.path,
                ref: defaultBranch,
              });

              if ('content' in fileData && fileData.content) {
                const content = Buffer.from(fileData.content, 'base64').toString('utf-8');
                files.push({
                  path: item.path,
                  content,
                  language: getLanguageFromPath(item.path),
                  size: item.size || content.length,
                });
              }
            } catch {
              // Skip files that can't be read
            }
          } else if (item.type === 'dir') {
            await fetchDirectory(item.path);
          }
        }
      }
    } catch (error: unknown) {
      const err = error as { status?: number; message?: string };
      if (err.status === 404) {
        throw new Error('Repository or path not found');
      }
      console.warn(`Failed to fetch ${path}:`, err.message);
    }
  }

  await fetchDirectory('');

  return {
    owner,
    name: repo,
    defaultBranch,
    files,
    structure: buildFileTree(files),
  };
}

export function getDirectoriesFromRepo(structure: FileNode[]): string[] {
  const directories: string[] = [];

  function traverse(nodes: FileNode[], prefix: string = ''): void {
    for (const node of nodes) {
      if (node.type === 'directory') {
        const path = prefix ? `${prefix}/${node.name}` : node.name;
        directories.push(path);
        if (node.children) {
          traverse(node.children, path);
        }
      }
    }
  }

  traverse(structure);
  return directories;
}
