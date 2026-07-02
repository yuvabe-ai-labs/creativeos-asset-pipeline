// Copy for the node delete-confirmation dialog. Pure (no React) so it is unit
// testable and the dialog stays a thin presentational shell. Count is how many
// nodes are about to be deleted (always >= 1 when the dialog is shown).

export type DeleteConfirmCopy = { title: string; description: string };

export function deleteConfirmCopy(count: number): DeleteConfirmCopy {
  if (count <= 1) {
    return {
      title: "Delete this node?",
      description: "This also removes any links connected to it. This can't be undone.",
    };
  }
  return {
    title: `Delete ${count} nodes?`,
    description: "This also removes any links connected to them. This can't be undone.",
  };
}
