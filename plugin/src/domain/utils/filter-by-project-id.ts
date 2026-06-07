export function filterOutProjectId<T extends { project_id: number }>(
  rows: T[],
  projectId: number,
): { changed: boolean; rows: T[] } {
  const rowsAfterFilter = rows.filter((row) => row.project_id !== projectId);

  return {
    changed: rowsAfterFilter.length !== rows.length,
    rows: rowsAfterFilter,
  };
}
