// Why a brand KB build could not be started. No server imports, so the copilot's pure turn logic
// and the server-side start can share them.

/** A build is already running for this client. */
export class BuildAlreadyRunningError extends Error {
  constructor() {
    super("A KB build is already running for this client.");
  }
}

/** Neither a website nor a document to build from. */
export class NothingToBuildFromError extends Error {
  constructor() {
    super("Add a website URL or upload at least one document.");
  }
}
