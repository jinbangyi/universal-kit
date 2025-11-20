export function getContextFromPath(IgnoredDirectories: string[], filePath: string): {
  domain ?: string;
  domainFeature ?: string;
  parentDir?: string;
  fileName?: string;
} {
  /**
   * Example path: src/domain/discord/role-mapping/role-mapping.service.ts
   * expect domain = discord, domainFeature = role-mapping, fileName = role-mapping.service
   *
   * Example path: src/domain/discord/discord.service.ts
   * expect domain = discord, domainFeature = undefined, fileName = discord.service
   */
  const parts = filePath.split('/');
  const domainIndex = parts.indexOf('domain');
  const fileName = parts[parts.length - 1]?.replace(/\.(ts|js):\d+:\d+$/, '');
  const parentDir = parts[parts.length - 2];

  if (domainIndex !== -1 && parts.length > domainIndex + 1) {
    const domain = parts[domainIndex + 1];
    const domainFeature = parts.length > domainIndex + 2 ? parts[domainIndex + 2] : undefined;
    if (
      domainFeature &&
      !domainFeature.includes('.js') &&
      !domainFeature.includes('.ts') &&
      !IgnoredDirectories.includes(domainFeature)
    ) {
      return { domain, domainFeature, parentDir, fileName };
    }

    return { domain, domainFeature: undefined, parentDir, fileName };
  }
  return { parentDir, fileName };
}

export function getCallerParentDirName(IgnoredDirectories: string[]): string | null {
  const { stack } = new Error();
  if (!stack) return null;

  const lines = stack.split('\n');
  // Skip the current constructor and find the actual caller
  // Stack trace format varies by Node.js version, but typically:
  // Error
  //   at FeatureLogger.getCallerContext (file.js:line:column)
  //   at new FeatureLogger (file.js:line:column)
  //   at SomeClass.constructor (file.js:line:column) <-- This is what we want
  //   at ...

  for (let i = 3; i < lines.length; i++) {
    const line = lines[i];
    if (line && line.trim() !== 'at') {
      const match =
        line.match(/at\s+(?:new\s+)?(\w+)\s+\(([^)]+)\)/) ??
        line.match(/at\s+(?:new\s+)?(\w+)\s+\(([^:]+):/);

      if (match) {
        const filePath = match[2];
        if (!filePath) continue;

        // Extract just the file name from the path
        return getContextFromPath(IgnoredDirectories, filePath).parentDir ?? null;
      }

      // Fallback for different stack trace formats
      const altMatch = line.match(/at\s+([^)]+):/);
      if (altMatch) {
        const filePath = altMatch[1];
        if (!filePath) continue;

        return getContextFromPath(IgnoredDirectories, filePath).parentDir ?? null;
      }
    }
  }

  return null;
}
