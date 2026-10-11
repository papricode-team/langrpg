// @vitest-environment happy-dom
import {expect,it,vi} from 'vitest';
import {renderResidentTools} from './level-editor-residents';
import {getWorldScene,sceneDocument} from './scene-data';
import {LevelEditorHistory} from './level-editor-model';

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

it('links a customer to a service in one undoable edit and preserves unrelated visits',()=>{
  const host=document.createElement('div'),source=structuredClone(sceneDocument),scene=source.maps.lindenhafen;
  const customer=scene.residents!.find(item=>item.id==='lindenhafen-promenade-reader')!,task=customer.schedule.find(item=>item.id==='market-visit')!;
  delete task.exchangeWith;task.fallbackActivityId='parcel-waiting-seat';task.heldObject='parcel';
  const original=structuredClone(customer),history=new LevelEditorHistory(source),error=vi.fn();
  const draw=()=>renderResidentTools(host,history.document.maps.lindenhafen,new Set(),next=>{history.edit(next);draw();},vi.fn(),error);
  draw();const resident=host.querySelector<HTMLSelectElement>('#resident-select')!;resident.value=customer.id;resident.dispatchEvent(new Event('change'));
  const selector=host.querySelector<HTMLSelectElement>('[data-task="market-visit"] [data-exchange]')!;
  selector.value=Array.from(selector.options).find(option=>option.textContent?.includes('Karl · midday-service'))!.value;selector.dispatchEvent(new Event('change'));
  const changed=history.document.maps.lindenhafen.residents!.find(item=>item.id===customer.id)!;
  expect(changed.schedule.find(item=>item.id===task.id)).toMatchObject({action:'wait',exchangeWith:{residentId:'lindenhafen-parcel-vendor',taskId:'midday-service'}});
  expect(changed.schedule.find(item=>item.id===task.id)?.fallbackActivityId).toBeUndefined();expect(changed.schedule.find(item=>item.id===task.id)?.heldObject).toBeUndefined();
  expect(changed.schedule.filter(item=>item.id!==task.id)).toEqual(original.schedule.filter(item=>item.id!==task.id));
  history.undo();expect(history.document.maps.lindenhafen.residents!.find(item=>item.id===customer.id)).toEqual(original);expect(history.canUndo).toBe(false);
  history.redo();expect(history.document.maps.lindenhafen.residents!.find(item=>item.id===customer.id)).toEqual(changed);expect(error).not.toHaveBeenCalled();
});

it('protects linked service tasks and vendors from deletion and rejects a reading position as a customer slot',()=>{
  const host=document.createElement('div'),scene=structuredClone(getWorldScene('lindenhafen')),change=vi.fn(),error=vi.fn();
  renderResidentTools(host,scene,new Set(),change,vi.fn(),error);
  const selectResident=(id:string)=>{const select=host.querySelector<HTMLSelectElement>('#resident-select')!;select.value=id;select.dispatchEvent(new Event('change'));};
  selectResident('lindenhafen-parcel-vendor');
  host.querySelector<HTMLButtonElement>('[data-remove-task="midday-service"]')!.click();host.querySelector<HTMLButtonElement>('#remove-resident')!.click();
  expect(error).toHaveBeenCalledTimes(2);expect(error).toHaveBeenLastCalledWith(expect.stringContaining('Anne/market-visit'));expect(change).not.toHaveBeenCalled();
  selectResident('lindenhafen-promenade-reader');
  const link=host.querySelector<HTMLSelectElement>('[data-task="morning-reading"] [data-exchange]')!;link.value='0';link.dispatchEvent(new Event('change'));
  expect(error).toHaveBeenLastCalledWith('Choose a waiting activity beside the vendor before linking a customer visit.');expect(change).not.toHaveBeenCalled();expect(link.value).toBe('');
});
