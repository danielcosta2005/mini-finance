declare module 'vitest' {
  export interface ProvidedContext {
    apiBaseUrl: string;
    databaseUrl: string;
    composeProjectName: string;
  }
}

export {};
