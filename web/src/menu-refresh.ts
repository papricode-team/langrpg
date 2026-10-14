/** Passive learning updates must preserve a learner's current list filter and typing position. */
export function refreshLearningMenu(content: HTMLElement, render: () => void): void {
  const input = content.querySelector<HTMLInputElement>('#lexicon-search, #word-search');
  const saved = input ? {id:input.id,value:input.value,focused:document.activeElement===input,
    start:input.selectionStart,end:input.selectionEnd} : undefined;
  const scroll = content.scrollTop;
  render();
  const replacement = saved ? content.querySelector<HTMLInputElement>(`#${saved.id}`) : undefined;
  if (replacement && saved) {
    replacement.value = saved.value;
    replacement.dispatchEvent(new Event('input', {bubbles:true}));
    if (saved.focused) {
      replacement.focus({preventScroll:true});
      if (saved.start !== null && saved.end !== null) replacement.setSelectionRange(saved.start,saved.end);
    }
  }
  content.scrollTop = scroll;
}
