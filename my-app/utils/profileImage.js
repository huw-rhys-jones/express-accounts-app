// Earlier uploads appended "?v=<timestamp>" to a URL that already had a query
// string, which corrupted the download token. Repair those URLs on read.
export function cleanProfileImageUrl(url) {
  const value = String(url || "");
  return value.replace(/\?v=(\d+)$/, "&v=$1");
}
