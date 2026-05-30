/** Minimal glob matcher: supports **, *, and literal segments. */
export function globMatch(glob: string, path: string): boolean {
  const escSeg = (s: string) =>
    s.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*");

  const norm = glob
    .replace(/^\*\*\//, "__LEAD__")
    .replace(/\/\*\*$/, "__TRAIL__")
    .replace(/\*\*/g, "__STAR2__");

  const pattern = norm
    .split("__STAR2__").map(escSeg).join(".*")
    .replace("__LEAD__", "(?:.*\/)?")
    .replace("__TRAIL__", "(?:\/.*)?");

  return new RegExp("^" + pattern + "$").test(path);
}
