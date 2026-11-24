import type { DragEvent } from "react";

function refuseDrag(event: DragEvent) {
  event.preventDefault();
  event.stopPropagation();
  event.dataTransfer.dropEffect = "none";
}

/** Files dragged over a window aren't uploads, and mustn't open in the browser either. */
export const noFileDrops = {
  onDragEnter: refuseDrag,
  onDragOver: refuseDrag,
  onDrop: (event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
  },
};
