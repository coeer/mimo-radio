declare module 'better-sqlite3' {
  interface Database {
    pragma(pragma: string): unknown
    exec(sql: string): void
    prepare(sql: string): {
      run(...params: unknown[]): { changes: number }
      get(...params: unknown[]): unknown
      all(...params: unknown[]): unknown[]
    }
    transaction<T>(fn: () => T): () => T
  }

  interface DatabaseConstructor {
    new (filename: string): Database
  }

  const Database: DatabaseConstructor
  export = Database
}
