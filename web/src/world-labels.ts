/** Screen-space distance keeps labels stable when the camera pulls back. */
export function storyLabelAlpha(cssDistance: number, focused: boolean): number {
  return focused ? 1 : Math.max(.45, 1 - Math.max(0, cssDistance - 180) / 900);
}
