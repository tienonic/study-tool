import type { ProjectData, RegistryEntry } from './types.ts';
import { slugify, validateProject } from './loader.ts';

const isSingleDeckMode = import.meta.env.VITE_STUDY_SINGLE_DECK === '1';
const includeLocalProjects = import.meta.env.DEV && import.meta.env.VITE_STUDY_SHOW_LOCAL_PROJECTS !== '0';

type LocalProjectBinding = {
  name: string;
  file: string;
};

export function selectGeneratedProject(modules: Record<string, ProjectData>): ProjectData | undefined {
  return modules['./generated/active-project.json'] ?? Object.values(modules)[0];
}

export function buildProjectRegistry(
  generatedProject: ProjectData | undefined,
  singleDeckMode: boolean,
  localProjects: LocalProjectBinding[] = [],
): RegistryEntry[] {
  if (singleDeckMode) return generatedProject ? [buildGeneratedEntry(generatedProject)] : [];
  if (localProjects.length > 0) return buildLocalProjectEntries(localProjects);

  return [
    buildExampleEntry(),
  ];
}

export function parseLocalProjectBindings(raw: string | undefined): LocalProjectBinding[] {
  if (!raw) return [];
  return raw
    .split(';')
    .map(entry => entry.trim())
    .filter(Boolean)
    .map(entry => {
      const [name, file] = entry.split('|').map(value => value?.trim() ?? '');
      return { name, file };
    })
    .filter(binding => binding.name && isProjectFileName(binding.file));
}

function buildGeneratedEntry(project: ProjectData): RegistryEntry {
  return {
    name: project.name,
    slug: slugify(project.name),
    folder: 'generated',
    loader: () => Promise.resolve(project),
  };
}

function buildGeneratedFileRegistry(): RegistryEntry[] {
  const loaders = import.meta.glob<ProjectData>('./generated/*.json', { import: 'default', exhaustive: true });
  const loader = loaders['./generated/active-project.json'] ?? Object.values(loaders)[0];
  if (!loader) return [];
  return [{
    name: 'Generated Deck',
    slug: 'generated-deck',
    folder: 'generated',
    loader,
  }];
}

function buildExampleEntry(): RegistryEntry {
  return {
    name: 'Example Art History Drill',
    slug: slugify('Example Art History Drill'),
    folder: '',
    loader: async () => {
      const { buildExampleArtHistoryProject } = await import('./example-art-history.ts');
      return buildExampleArtHistoryProject();
    },
  };
}

function buildLocalProjectEntries(localProjects: LocalProjectBinding[]): RegistryEntry[] {
  return localProjects.map(project => buildLocalProjectFileEntry(project.name, project.file));
}

function buildLocalProjectFileEntry(name: string, file: string): RegistryEntry {
  return {
    name,
    slug: slugify(name),
    folder: '',
    loader: async () => loadLocalProjectFile(file),
  };
}

async function loadLocalProjectFile(file: string): Promise<ProjectData> {
  const response = await fetch(`/__project-file?dir=projects&file=${encodeURIComponent(file)}`);
  const payload = await response.json().catch(() => null) as { contents?: string; error?: string } | null;
  if (!response.ok || typeof payload?.contents !== 'string') {
    throw new Error(payload?.error ?? `Could not load local project file: ${file}`);
  }

  const data = JSON.parse(payload.contents) as ProjectData;
  const errors = validateProject(data);
  if (errors.length > 0) {
    throw new Error(`Invalid local project file "${file}": ${errors.join(', ')}`);
  }
  return data;
}

function isProjectFileName(file: string): boolean {
  return Boolean(file)
    && !file.includes('/')
    && !file.includes('\\')
    && file.toLowerCase().endsWith('.json');
}

export const projectRegistry: RegistryEntry[] = isSingleDeckMode
  ? buildGeneratedFileRegistry()
  : buildProjectRegistry(
    undefined,
    false,
    includeLocalProjects ? parseLocalProjectBindings(import.meta.env.VITE_STUDY_LOCAL_PROJECTS) : [],
  );
