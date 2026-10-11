// @vitest-environment happy-dom
import {expect,it,vi} from 'vitest';
import {renderResidentTools} from './level-editor-residents';
import {getWorldScene} from './scene-data';

it('previews a rainy schedule without changing the authored scene or creating an undo operation',()=>{
  const host=document.createElement('div'),scene=structuredClone(getWorldScene('lindenhafen')),before=structuredClone(scene);
  const change=vi.fn(),preview=vi.fn(),error=vi.fn();
  renderResidentTools(host,scene,new Set(),change,preview,error);
  const hour=host.querySelector<HTMLInputElement>('#resident-preview-hour')!,weather=host.querySelector<HTMLSelectElement>('#resident-preview-weather')!;
  hour.value='9.75';weather.value='shower';host.querySelector<HTMLButtonElement>('#preview-residents')!.click();
  expect(preview).toHaveBeenCalledExactlyOnceWith(9.75,'shower');expect(change).not.toHaveBeenCalled();expect(scene).toEqual(before);
  host.querySelector<HTMLButtonElement>('#clear-resident-preview')!.click();expect(preview).toHaveBeenLastCalledWith(undefined,'shower');
  hour.value='24';host.querySelector<HTMLButtonElement>('#preview-residents')!.click();
  expect(error).toHaveBeenCalledWith('Choose an hour between 0 and 24.');expect(preview).toHaveBeenCalledTimes(2);
});
