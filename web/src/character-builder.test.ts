// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bindCharacterBuilder, characterBuilderMarkup } from './character-builder';
import { paintAvatar, releaseAvatarPreview } from './avatar-baker';
import { characterCatalogue, normalizeAvatar, recipeErrors, resolveRecipe } from './character-recipe.mjs';

vi.mock('./avatar-baker', () => ({ paintAvatar:vi.fn().mockResolvedValue(undefined), releaseAvatarPreview:vi.fn() }));
let tick: FrameRequestCallback;
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('requestAnimationFrame', (callback:FrameRequestCallback) => { tick = callback; return 1; });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  document.body.innerHTML = characterBuilderMarkup();
});
afterEach(() => { document.body.innerHTML = ''; tick(100); vi.unstubAllGlobals(); });
const click = (selector:string) => document.querySelector<HTMLButtonElement>(selector)!.click();

describe('component builder', () => {
  it.each(['wave','seated','lantern-raise'])('previews matching %s art, retains the recipe and returns to standing for unsupported outfits', async poseSet => {
    const initial=normalizeAvatar({v:2,build:'regular',parts:{face:'soft',hair:'waves',top:'shirt',bottom:'straight',footwear:'boots',outer:'travel',held:poseSet==='lantern-raise'?'lantern':null}});
    const value=bindCharacterBuilder(document.body,initial);
    await vi.waitFor(()=>expect(paintAvatar).toHaveBeenCalledTimes(5));
    const select=document.querySelector<HTMLSelectElement>('[data-motion]')!;
    expect(select.querySelector<HTMLOptionElement>(`[value="${poseSet}"]`)!.disabled).toBe(false);
    vi.mocked(paintAvatar).mockClear();
    select.value=poseSet;select.dispatchEvent(new Event('change'));
    expect(paintAvatar).toHaveBeenCalledWith(expect.anything(),initial,0,{poseSet});
    expect(paintAvatar).toHaveBeenCalledWith(expect.anything(),initial,12,{poseSet});
    expect(value()).toEqual(initial);
    await Promise.resolve();await Promise.resolve();await Promise.resolve();
    tick(0);for(let time=50;time<=700;time+=50)tick(time);
    expect(vi.mocked(paintAvatar).mock.calls.some(([, ,frame,options])=>frame===1&&options?.poseSet===poseSet)).toBe(true);
    click('[data-tab="Bottom"]');click('[data-option="skirt"]');
    expect(select.value).toBe('standing');
    expect(select.querySelector<HTMLOptionElement>(`[value="${poseSet}"]`)!.disabled).toBe(true);
    expect(select.querySelector(`[value="${poseSet}"]`)!.textContent).toContain('unavailable for this outfit');
    expect(value().parts.bottom).toBe('skirt');
    expect(vi.mocked(paintAvatar).mock.calls.at(-1)?.[3]).toEqual({poseSet:'walk'});
  });
  it('returns to standing when the lantern is removed during its action', () => {
    const initial=normalizeAvatar({v:2,build:'regular',parts:{face:'soft',hair:'waves',top:'shirt',bottom:'straight',footwear:'boots',outer:'travel',held:'lantern'}});
    const value=bindCharacterBuilder(document.body,initial);
    const select=document.querySelector<HTMLSelectElement>('[data-motion]')!;
    select.value='lantern-raise';select.dispatchEvent(new Event('change'));
    click('[data-tab="Extras"]');click('[data-slot="held"][data-option=""]');
    expect(select.value).toBe('standing');
    expect(select.querySelector<HTMLOptionElement>('[value="lantern-raise"]')!.disabled).toBe(true);
    expect(value().parts).toEqual({...initial.parts,held:null});
  });
  it('restores all standing previews when a wave load is still pending', async () => {
    const recipe=normalizeAvatar({v:2,build:'regular',parts:{face:'soft',top:'shirt',bottom:'straight',footwear:'boots'}});
    bindCharacterBuilder(document.body,recipe);
    await Promise.resolve();await Promise.resolve();await Promise.resolve();
    const select=document.querySelector<HTMLSelectElement>('[data-motion]')!;
    vi.mocked(paintAvatar).mockImplementationOnce(()=>new Promise(()=>{}));
    select.value='wave';select.dispatchEvent(new Event('change'));
    vi.mocked(paintAvatar).mockClear();
    select.value='standing';select.dispatchEvent(new Event('change'));
    expect(paintAvatar).toHaveBeenCalledTimes(5);
    expect(vi.mocked(paintAvatar).mock.calls.every(call=>call[3]?.poseSet==='walk')).toBe(true);
  });
  it('loads tiles for the open tab, updates the recipe and returns independent snapshots', () => {
    const value = bindCharacterBuilder(document.body, {});
    expect(document.querySelectorAll('.builder-tile img')).toHaveLength(characterCatalogue.builds.length);
    expect(document.querySelector('.builder-tile[aria-pressed="true"] img')!.getAttribute('src')).toContain('body-regular');
    click('[data-tab="Bottom"]');
    expect(document.querySelectorAll('.builder-tile img')).toHaveLength(characterCatalogue.components.filter(part=>part.slot==='bottom'&&part.build==='regular').length);
    click('[data-option="skirt"]');
    expect(value().parts.bottom).toBe('skirt');
    const copy = value(); copy.parts.bottom = 'straight';
    expect(value().parts.bottom).toBe('skirt');
    click('[data-option="shorts"]');
    click('[data-tab="Feet"]'); click('[data-option="sandals"]');
    expect(value().parts).toMatchObject({bottom:'shorts',footwear:'sandals'});
    const shoeColour=document.querySelector<HTMLInputElement>('[data-custom-colour="footwear.primary"]')!;
    shoeColour.value='#593f29'; shoeColour.dispatchEvent(new Event('input',{bubbles:true}));
    expect(value().colors['footwear.primary']).toBe('#593f29');
    expect(paintAvatar).toHaveBeenCalled();
  });
  it('switches builds, preserves compatible clothes and only offers the selected wardrobe', () => {
    const initial=normalizeAvatar({});
    initial.parts.headwear='cap'; initial.parts.hair='waves';
    initial.parts.bottom='skirt'; initial.parts.top='tee';
    initial.colors['bottom.primary']='#b07b41';
    const value=bindCharacterBuilder(document.body,initial);
    for(const build of ['slim','broad','regular']) {
      click('[data-tab="Body"]'); click(`[data-slot="body"][data-option="${build}"]`);
      expect(value().build).toBe(build);
      expect(value().parts).toMatchObject({hair:'waves',top:'tee',bottom:'skirt',footwear:'boots',headwear:'cap'});
      expect(value().colors['bottom.primary']).toBe('#b07b41');
      expect(recipeErrors(value())).toEqual([]);
      expect(resolveRecipe(value()).layers.every(layer=>layer.build===build)).toBe(true);
      click('[data-tab="Top"]');
      expect([...document.querySelectorAll<HTMLElement>('[data-slot="top"]')].map(tile=>tile.dataset.option)).toEqual(characterCatalogue.components.filter(part=>part.slot==='top'&&part.build===build).map(part=>part.optionId));
      click('[data-tab="Head"]');
      expect([...document.querySelectorAll<HTMLElement>('[data-slot="headwear"]')].map(tile=>tile.dataset.option)).toEqual(['',...characterCatalogue.components.filter(part=>part.slot==='headwear'&&part.build===build).map(part=>part.optionId)]);
      expect(document.querySelector('[data-slot="headwear"][data-option="cap"]')?.getAttribute('aria-pressed')).toBe('true');
    }
    value.applyPreset('Willow');
    expect(value().build).toBe('regular');
    expect(recipeErrors(value())).toEqual([]);
  });
  it('offers bald, custom colours, presets and keyboard tab navigation', () => {
    const value = bindCharacterBuilder(document.body, {});
    click('[data-tab="Hair"]'); click('[data-slot="hair"][data-option=""]');
    expect(value().parts.hair).toBeNull();
    const input = document.querySelector<HTMLInputElement>('[data-custom-colour="hair"]')!;
    input.value = '#aa1122'; input.dispatchEvent(new Event('input',{bubbles:true}));
    expect(value().hair).toBe('#aa1122');
    expect(input.isConnected).toBe(true);
    value.applyPreset('Willow');
    expect(value().parts.hair).toBe('waves');
    document.querySelector('[data-tab="Hair"]')!.dispatchEvent(new KeyboardEvent('keydown',{key:'End',bubbles:true}));
    expect(document.activeElement?.getAttribute('data-tab')).toBe('Extras');
    expect(document.querySelector('[data-tab="Extras"]')!.getAttribute('aria-selected')).toBe('true');
  });
  it('surfaces occupancy and exclusions from catalogue data', () => {
    const skirt = characterCatalogue.components.find(part=>part.id==='bottom-skirt')!;
    const old = {occupies:skirt.occupies,excludes:skirt.excludes};
    skirt.occupies=['bottom','top']; skirt.excludes=['headwear'];
    try {
      const recipe = normalizeAvatar({}); recipe.parts.bottom='skirt';
      const value = bindCharacterBuilder(document.body,recipe);
      click('[data-tab="Top"]');
      expect(document.querySelector<HTMLButtonElement>('[data-slot="top"]')!.disabled).toBe(true);
      expect(document.querySelector('.builder-rule')!.textContent).toContain('selected');
      expect(value().parts.top).toBeNull();
      click('[data-tab="Head"]');
      expect(document.querySelector<HTMLButtonElement>('[data-slot="headwear"]')!.disabled).toBe(true);
    } finally { Object.assign(skirt,old); }
  });
  it('releases all five preview leases when the editor is removed', () => {
    bindCharacterBuilder(document.body,{});
    document.body.innerHTML=''; tick(100);
    expect(releaseAvatarPreview).toHaveBeenCalledTimes(5);
  });
  it('selects, colours and removes a scarf through Extras', () => {
    const value=bindCharacterBuilder(document.body,{});
    click('[data-tab="Extras"]');
    for (const option of ['scarf','kerchief','cowl']) {
      click(`[data-slot="neck"][data-option="${option}"]`);
      expect(value().parts.neck).toBe(option);
    }
    const colour=document.querySelector<HTMLInputElement>('[data-custom-colour="neck.primary"]')!;
    colour.value='#a54932'; colour.dispatchEvent(new Event('input',{bubbles:true}));
    expect(value().colors['neck.primary']).toBe('#a54932');
    click('[data-slot="eyewear"][data-option="round"]');
    const frames=document.querySelector<HTMLInputElement>('[data-custom-colour="eyewear.primary"]')!;
    frames.value='#ad6635'; frames.dispatchEvent(new Event('input',{bubbles:true}));
    expect(value().parts).toMatchObject({neck:'cowl',eyewear:'round'});
    expect(value().colors['eyewear.primary']).toBe('#ad6635');
    click('[data-slot="neck"][data-option=""]');
    expect(value().parts.neck).toBeNull();
    expect(value().parts.eyewear).toBe('round');
    expect(value().colors['neck.primary']).toBe('#a54932');
    click('[data-slot="eyewear"][data-option=""]');
    expect(value().parts.eyewear).toBeNull();
  });
  it('selects bags and an untinted lantern independently in Extras', () => {
    const value=bindCharacterBuilder(document.body,{});
    click('[data-tab="Extras"]');
    click('[data-slot="held"][data-option="lantern"]');
    for (const bag of ['satchel','backpack','tote','belt-pouch']) {
      click(`[data-slot="bag"][data-option="${bag}"]`);
      expect(value().parts).toMatchObject({bag,held:'lantern'});
    }
    const colour=document.querySelector<HTMLInputElement>('[data-custom-colour="bag.primary"]')!;
    colour.value='#ad6635'; colour.dispatchEvent(new Event('input',{bubbles:true}));
    expect(value().colors['bag.primary']).toBe('#ad6635');
    expect(document.querySelector('[data-custom-colour^="held."]')).toBeNull();
    click('[data-slot="bag"][data-option=""]');
    expect(value().parts.bag).toBeNull();
    expect(value().parts.held).toBe('lantern');
    click('[data-slot="held"][data-option=""]');
    expect(value().parts.held).toBeNull();
  });
  it('clears a cap for a bun and restores headwear choices for short coils', () => {
    const recipe = normalizeAvatar({}); recipe.parts.headwear='cap';
    const value = bindCharacterBuilder(document.body,recipe);
    click('[data-tab="Hair"]'); click('[data-slot="hair"][data-option="bun"]');
    expect(value().parts.hair).toBe('bun');
    expect(value().parts.headwear).toBeNull();
    click('[data-tab="Head"]');
    expect(document.querySelector<HTMLButtonElement>('[data-slot="headwear"][data-option="cap"]')!.disabled).toBe(true);
    expect(document.querySelector('.builder-rule')!.textContent).toContain('High bun');
    click('[data-tab="Hair"]'); click('[data-slot="hair"][data-option="coils"]');
    click('[data-tab="Head"]');
    expect(document.querySelector<HTMLButtonElement>('[data-slot="headwear"][data-option="cap"]')!.disabled).toBe(false);
    click('[data-slot="headwear"][data-option="sunhat"]');
    expect(value().parts.headwear).toBe('sunhat');
    const ribbon = document.querySelector<HTMLInputElement>('[data-custom-colour="headwear.secondary"]')!;
    ribbon.value='#326a65'; ribbon.dispatchEvent(new Event('input',{bubbles:true}));
    expect(value().colors['headwear.secondary']).toBe('#326a65');
    expect(value().parts.hair).toBe('coils');
  });
  it('a dress occupies Bottom, exposes its belt colour and restores trousers when removed', () => {
    const value = bindCharacterBuilder(document.body,{});
    click('[data-tab="Top"]'); click('[data-slot="top"][data-option="dress-day"]');
    expect(value().parts.bottom).toBeNull();
    const belt=document.querySelector<HTMLInputElement>('[data-custom-colour="top.secondary"]')!;
    belt.value='#5c7862'; belt.dispatchEvent(new Event('input',{bubbles:true}));
    expect(value().colors['top.secondary']).toBe('#5c7862');
    click('[data-tab="Bottom"]');
    expect(document.querySelector<HTMLButtonElement>('[data-slot="bottom"][data-option="straight"]')!.disabled).toBe(true);
    expect(document.querySelector('.builder-rule')!.textContent).toContain('Day dress');
    click('[data-tab="Top"]'); click('[data-slot="top"][data-option="tee"]');
    expect(value().parts.bottom).toBe('straight');
    click('[data-tab="Bottom"]');
    expect(document.querySelector<HTMLButtonElement>('[data-slot="bottom"][data-option="straight"]')!.disabled).toBe(false);
  });
});
