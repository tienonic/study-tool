import { validateAndOpenFile } from '../launcher/store.ts';

export interface ProjectFileEntry {
  file: string;
  name: string;
  createdAt: string;
  modifiedAt: string;
  size: number;
}

interface ProjectFilesResponse {
  files?: ProjectFileEntry[];
  error?: string;
}

interface ProjectFileResponse {
  contents?: string;
  error?: string;
}

export async function listProjectFiles() {
  const response = await fetch('/__project-files?dir=projects');
  const payload = (await response.json()) as ProjectFilesResponse;
  if (!response.ok) {
    throw new Error(payload.error ?? 'Failed to list project files.');
  }
  return payload.files ?? [];
}

export async function openProjectFile(file: string) {
  const response = await fetch(`/__project-file?dir=projects&file=${encodeURIComponent(file)}`);
  const payload = (await response.json()) as ProjectFileResponse;
  if (!response.ok) {
    throw new Error(payload.error ?? 'Failed to open project file.');
  }
  if (typeof payload.contents !== 'string') {
    throw new Error('Project file did not return JSON contents.');
  }
  await validateAndOpenFile(payload.contents);
}

export async function openProjectsFolder() {
  await fetch('/__open-folder?path=projects');
}
