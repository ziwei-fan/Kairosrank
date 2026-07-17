// True only while this content script's extension context is still alive.
// After the extension is reloaded/updated, old content scripts linger in open
// tabs and any chrome.* call throws "Extension context invalidated" — guard with this.
export function extAlive(): boolean {
  try {
    return !!chrome?.runtime?.id;
  } catch {
    return false;
  }
}
