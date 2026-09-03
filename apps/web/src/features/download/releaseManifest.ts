export type ReleaseArtifactPlatform = 'macos' | 'android';
export type ReleaseArtifactArch = 'arm64' | 'x64' | 'universal';

export interface ReleaseArtifact {
  platform: ReleaseArtifactPlatform;
  arch: ReleaseArtifactArch;
  filename: string;
  url: string;
  mirrorUrl?: string;
  sha256: string;
  size: number;
}

export interface ReleaseManifest {
  version: string;
  commit: string;
  publishedAt: string;
  githubRelease: string;
  artifacts: ReleaseArtifact[];
}

export function downloadHref(artifact: ReleaseArtifact): string {
  return artifact.mirrorUrl || artifact.url;
}

export function findArtifact(
  manifest: ReleaseManifest,
  platform: ReleaseArtifactPlatform,
  arch?: ReleaseArtifactArch,
): ReleaseArtifact | undefined {
  return manifest.artifacts.find((item) => (
    item.platform === platform && (!arch || item.arch === arch)
  ));
}
