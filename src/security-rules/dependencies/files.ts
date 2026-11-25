/**
 * Dependency manifest and lockfile names. Pure data, shared with the browser extension, which sends
 * only these files (never source code) so the server can run the OSV vulnerability check.
 */

/** Manifest files (declared dependencies, not resolved versions). */
export const MANIFEST_FILES: Record<string, string> = {
  'package.json': 'npm',
  'requirements.txt': 'PyPI',
  'pyproject.toml': 'PyPI',
  Pipfile: 'PyPI',
  'setup.py': 'PyPI',
  'setup.cfg': 'PyPI',
  'composer.json': 'Packagist',
  'go.mod': 'Go',
  'Cargo.toml': 'crates.io',
  'pom.xml': 'Maven',
  'build.gradle': 'Maven',
  'build.gradle.kts': 'Maven',
  Gemfile: 'RubyGems',
};

/** Lockfile names matched by the dependency adapters in lockfiles.ts. */
const LOCKFILE = /^(package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|poetry\.lock|Pipfile\.lock|composer\.lock|go\.sum|Cargo\.lock|gradle\.lockfile|packages\.lock\.json|Gemfile\.lock|requirements([-_.][\w-]+)?\.txt|[^/]+\.csproj)$/i;

export function isDependencyFile(basename: string): boolean {
  return !!MANIFEST_FILES[basename] || LOCKFILE.test(basename);
}
