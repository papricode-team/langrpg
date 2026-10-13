import { describe, expect, it } from 'vitest';
import fixtures from '../../server/testdata/avatar-migration.json';
import { characterCatalogue, normalizeAvatar, recipeErrors, resolveRecipe, catalogueForExpression, availableFaceExpressions, avatarTextureKey } from './character-recipe.mjs';
import { characterPresets, randomAvatar } from './character-presets';

describe('saved avatar contract shared with Go', () => {
  for (const fixture of fixtures) it(fixture.name, () => {
    const migrated = normalizeAvatar(fixture.input);
    expect(migrated).toEqual(fixture.expected);
    expect(recipeErrors(migrated)).toEqual([]);
    expect(normalizeAvatar(migrated)).toEqual(migrated);
  });
  it('retains the old fallback outfit rather than selecting a new skirt', () => {
    const result = normalizeAvatar(fixtures.find(f => f.name === 'historical-fallback')!.input);
    expect(result.parts).toMatchObject({ face:'oval', hair:'waves', outer:'travel', bottom:'straight', footwear:'boots' });
  });
  it('shares hair colour with facial hair while a cap hides only scalp hair', () => {
    const recipe = normalizeAvatar(fixtures.find(f => f.name === 'v2-facial-hair-with-cap')!.input);
    recipe.hair = '#946b45';
    for (const facing of ['down', 'right', 'up', 'left'] as const) {
      const capped = resolveRecipe(recipe, facing).layers;
      expect(capped.some(layer => layer.slot === 'hair')).toBe(false);
      expect(capped.find(layer => layer.slot === 'facial-hair')?.tints.primary).toBe(0x946b45);
      const bare = resolveRecipe({ ...recipe, parts: { ...recipe.parts, headwear: null } }, facing).layers;
      expect(bare.find(layer => layer.slot === 'hair')?.tints.primary).toBe(0x946b45);
      expect(bare.find(layer => layer.slot === 'facial-hair')?.tints.primary).toBe(0x946b45);
    }
  });
  it('all six presets and random choices are persistable', () => {
    expect(characterPresets).toHaveLength(6);
    for (const preset of characterPresets) expect(recipeErrors(preset.recipe)).toEqual([]);
    let seed = 937;
    const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    const bottoms = new Map<string, Set<string|null>>();
    for (let i = 0; i < 1000; i++) {
      const recipe = randomAvatar(random);
      expect(recipeErrors(recipe)).toEqual([]);
      if(!bottoms.has(recipe.build)) bottoms.set(recipe.build,new Set());
      bottoms.get(recipe.build)!.add(recipe.parts.bottom);
      expect(resolveRecipe(recipe).layers.every(layer=>layer.build===recipe.build)).toBe(true);
    }
    expect([...bottoms.keys()].sort()).toEqual([...characterCatalogue.builds].sort());
    for(const build of characterCatalogue.builds) {
      const canWearDress=characterCatalogue.components.some(part=>part.build===build&&part.occupies?.includes('bottom'));
      expect(bottoms.get(build)).toEqual(new Set([...(canWearDress?[null]:[]),...characterCatalogue.components.filter(part=>part.slot==='bottom'&&part.build===build).map(part=>part.optionId)]));
    }
  });
  it('voluminous hairstyles exclude every headwear option in every facing', () => {
    for (const hair of ['bun','afro','mohawk']) for (const hat of characterCatalogue.components.filter(part=>part.slot==='headwear')) {
      const recipe = normalizeAvatar({});
      recipe.parts.hair=hair; recipe.parts.headwear=hat.optionId;
      for (const facing of ['down','right','up','left'] as const) {
        const result=resolveRecipe(recipe,facing);
        expect(result.layers.some(layer=>layer.id===`hair-${hair}`)).toBe(true);
        expect(result.layers.some(layer=>layer.slot==='headwear')).toBe(false);
        expect(result.disabled.headwear.reason).toBe('excluded');
      }
      expect(recipeErrors(recipe)).toEqual([]);
      expect(resolveRecipe(normalizeAvatar(recipe)).layers.some(layer=>layer.slot==='headwear')).toBe(false);
    }
  });
  it('full hats hide scalp hair while partial hats retain it beneath the hat', () => {
    const full = ['cap','beanie','beret','turban'];
    for (const headwear of [...full,'brimmed','sunhat','bucket','headband']) {
      const base = normalizeAvatar({});
      const recipe = normalizeAvatar({...base,hair:'#48372e',parts:{...base.parts,hair:'bob','facial-hair':'full-beard',headwear}});
      expect(recipe.parts).toMatchObject({hair:'bob',headwear});
      expect(recipeErrors(recipe)).toEqual([]);
      for (const facing of ['down','right','up','left'] as const) {
        const {layers} = resolveRecipe(recipe,facing);
        const hatIndex = layers.findIndex(layer=>layer.slot==='headwear');
        const hairIndex = layers.findIndex(layer=>layer.slot==='hair');
        expect(hatIndex).toBeGreaterThanOrEqual(0);
        if (full.includes(headwear)) expect(hairIndex).toBe(-1);
        else {
          expect(hairIndex).toBeGreaterThanOrEqual(0);
          expect(hatIndex).toBeGreaterThan(hairIndex);
          expect(layers[hairIndex].tints.primary).toBe(0x48372e);
        }
        expect(layers.find(layer=>layer.slot==='facial-hair')?.tints.primary).toBe(0x48372e);
      }
    }
  });
  it('every dress suppresses both bottom choices while preserving footwear and material tint', () => {
    const recipe=normalizeAvatar(fixtures.find(f=>f.name==='v2-dress-occupies-bottom')!.input);
    for(const top of ['dress-day','dress-pinafore','dress-wrap','dress-long'])for(const bottom of characterCatalogue.components.filter(part=>part.slot==='bottom').map(part=>part.optionId))for(const facing of ['down','right','up','left'] as const){
      const result=resolveRecipe({...recipe,parts:{...recipe.parts,top,bottom}},facing);
      expect(result.layers.some(layer=>layer.slot==='bottom')).toBe(false);
      expect(result.layers.some(layer=>layer.id==='footwear-boots')).toBe(true);
      const dress=result.layers.find(layer=>layer.id===`top-${top}`);
      expect(dress).toBeDefined();
      if(top!=='dress-long')expect(dress?.tints.secondary).toBe(0x5c7862);
      expect(result.disabled.bottom.reason).toBe('occupied');
    }
    expect(recipe.parts.bottom).toBeNull();
    expect(recipeErrors(recipe)).toEqual([]);
  });
  it('wide hems cover boot shafts while fitted trousers tuck beneath them', () => {
    for(const bottom of ['wide','skirt-long','slim','cargo'])for(const footwear of ['boots','tall-boots']){
      const base=normalizeAvatar({});
      const recipe=normalizeAvatar({...base,parts:{...base.parts,top:'tee',outer:null,bottom,footwear}});
      expect(recipe.parts).toMatchObject({bottom,footwear});
      expect(recipeErrors(recipe)).toEqual([]);
      for(const facing of ['down','right','up','left'] as const){
        const result=resolveRecipe(recipe,facing);
        const bottomIndex=result.layers.findIndex(layer=>layer.id===`bottom-${bottom}`);
        const shoeIndex=result.layers.findIndex(layer=>layer.id===`footwear-${footwear}`);
        const topIndex=result.layers.findIndex(layer=>layer.id==='top-tee');
        expect(Math.min(bottomIndex,shoeIndex)).toBeGreaterThanOrEqual(0);
        expect(topIndex).toBeGreaterThan(Math.max(bottomIndex,shoeIndex));
        if(['wide','skirt-long'].includes(bottom)){
          expect(bottomIndex).toBeGreaterThan(shoeIndex);
          expect(result.overlaps).toContainEqual({by:`bottom-${bottom}`,slot:'footwear',coverage:'upper'});
        }else expect(shoeIndex).toBeGreaterThan(bottomIndex);
      }
    }
  });
  it('a tunic covers the upper bottom without clearing or disabling it', () => {
    for(const bottom of ['straight','skirt']){
      const recipe=normalizeAvatar({...normalizeAvatar({}),parts:{...normalizeAvatar({}).parts,top:'tunic',bottom,outer:null}});
      expect(recipe.parts.bottom).toBe(bottom);
      expect(recipeErrors(recipe)).toEqual([]);
      for(const facing of ['down','right','up','left'] as const){
        const result=resolveRecipe(recipe,facing);
        expect(result.disabled.bottom).toBeUndefined();
        expect(result.overlaps).toContainEqual({by:'top-tunic',slot:'bottom',coverage:'upper'});
        const topIndex=result.layers.findIndex(layer=>layer.id==='top-tunic');
        const bottomIndex=result.layers.findIndex(layer=>layer.id===`bottom-${bottom}`);
        expect(bottomIndex).toBeGreaterThanOrEqual(0);
        expect(topIndex).toBeGreaterThan(bottomIndex);
      }
    }
  });
  it('scarves layer above coats, with long hair falling over them from behind', () => {
    for (const neck of ['scarf','kerchief','cowl']) {
      const base=normalizeAvatar({});
      const recipe=normalizeAvatar({...base,parts:{...base.parts,neck,hair:'straight',outer:'trench'},colors:{...base.colors,'neck.primary':'#a54932'}});
      expect(recipe.parts.neck).toBe(neck);
      expect(recipeErrors(recipe)).toEqual([]);
      for (const facing of ['down','right','up','left'] as const) {
        const {layers}=resolveRecipe(recipe,facing);
        const scarf=layers.findIndex(layer=>layer.slot==='neck');
        const hair=layers.findIndex(layer=>layer.slot==='hair');
        const coat=layers.findIndex(layer=>layer.slot==='outer');
        expect(Math.min(scarf,hair,coat)).toBeGreaterThanOrEqual(0);
        expect(scarf).toBeGreaterThan(coat);
        if (facing==='up') expect(hair).toBeGreaterThan(scarf);
        else expect(scarf).toBeGreaterThan(hair);
        expect(layers[scarf].tints.primary).toBe(0xa54932);
      }
    }
  });
  it('eyewear remains equipped beneath hats with separately tinted frames and fixed lenses', () => {
    for (const eyewear of ['round','square','cat-eye','sunglasses']) for (const headwear of characterCatalogue.components.filter(part=>part.slot==='headwear').map(part=>part.optionId)) {
      const base=normalizeAvatar({});
      const recipe=normalizeAvatar({...base,parts:{...base.parts,eyewear,headwear,hair:'bob'},colors:{...base.colors,'eyewear.primary':'#ad6635'}});
      expect(recipe.parts.eyewear).toBe(eyewear);
      expect(recipeErrors(recipe)).toEqual([]);
      for (const facing of ['down','right','up','left'] as const) {
        const {layers}=resolveRecipe(recipe,facing);
        const glasses=layers.findIndex(layer=>layer.slot==='eyewear');
        const hat=layers.findIndex(layer=>layer.slot==='headwear');
        expect(glasses).toBeGreaterThan(layers.findIndex(layer=>layer.slot==='face'));
        expect(hat).toBeGreaterThan(glasses);
        expect(layers[glasses].tints.primary).toBe(0xad6635);
        if (eyewear==='sunglasses') expect(layers[glasses].tints.detail).toBe(0xffffff);
        else expect(layers[glasses].materials).toEqual(['primary']);
      }
    }
  });
  it('bags retain visible straps above clothing and the lantern follows facing occlusion', () => {
    for (const bag of ['satchel','backpack','tote','belt-pouch']) {
      const base=normalizeAvatar({});
      const recipe=normalizeAvatar({...base,parts:{...base.parts,bag,held:'lantern',outer:'trench'},colors:{...base.colors,'bag.primary':'#ad6635'}});
      expect(recipe.parts).toMatchObject({bag,held:'lantern'});
      expect(recipeErrors(recipe)).toEqual([]);
      for (const facing of ['down','right','up','left'] as const) {
        const {layers}=resolveRecipe(recipe,facing);
        const bagIndex=layers.findIndex(layer=>layer.slot==='bag');
        const heldIndex=layers.findIndex(layer=>layer.slot==='held');
        const bodyIndex=layers.findIndex(layer=>layer.slot==='body');
        expect(bagIndex).toBeGreaterThan(layers.findIndex(layer=>layer.slot==='outer'));
        expect(layers[bagIndex].tints.primary).toBe(0xad6635);
        expect(layers[heldIndex].materials).toEqual(['detail']);
        expect(layers[heldIndex].tints.detail).toBe(0xffffff);
        if (facing==='up'||facing==='left') expect(heldIndex).toBeLessThan(bodyIndex);
        else expect(heldIndex).toBeGreaterThan(bagIndex);
      }
    }
  });
});


describe('portrait expression identity', () => {
  it('replaces only the matching face and leaves the saved recipe untouched', () => {
    const recipe=normalizeAvatar({v:2,parts:{face:'soft',hair:'waves',headwear:'sunhat',outer:'travel'}}),before=structuredClone(recipe);
    const neutral=resolveRecipe(recipe).layers;
    for(const expression of ['smile','worried']){
      const catalogue=catalogueForExpression(recipe,expression),layers=resolveRecipe(recipe,'down',catalogue).layers;
      expect(layers.filter(p=>p.slot!=='face')).toEqual(neutral.filter(p=>p.slot!=='face'));
      expect(layers.find(p=>p.slot==='face')?.id).toBe(`face-soft-${expression}`);
      expect(recipeErrors(recipe,catalogue)).toEqual([]);
      expect(avatarTextureKey(recipe,catalogue)).not.toBe(avatarTextureKey(recipe));
      expect(recipe).toEqual(before);
    }
    expect(availableFaceExpressions(recipe)).toEqual(['smile','worried']);
    expect(characterCatalogue.components.filter(p=>p.slot==='face').every(p=>!p.expression)).toBe(true);
    expect(recipeErrors({...recipe,parts:{...recipe.parts,face:'soft-smile'}})).toContain('Unknown option face.soft-smile');
  });
  it('refuses to substitute a different identity or an unregistered action grid', () => {
    const recipe=normalizeAvatar({v:2,parts:{face:'oval'}});
    expect(availableFaceExpressions(recipe)).toEqual([]);
    expect(()=>catalogueForExpression(recipe,'smile')).toThrow('Unavailable expression');
    expect(()=>catalogueForExpression({...recipe,parts:{...recipe.parts,face:'soft'}},'smile',{...characterCatalogue,poseSet:'wave'})).toThrow('walking grid');
    expect(()=>catalogueForExpression(recipe,'missing')).toThrow('Unavailable expression');
  });
});
