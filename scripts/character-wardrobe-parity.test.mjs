import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {missingWardrobeOptions} from './character-wardrobe-parity.mjs';

test('published wardrobe offers every regular option for slim and broad builds', async () => {
  for(const path of ['../art/source/character-kit/hd/catalogue.json','../server/character-kit.json']) {
    const catalogue=JSON.parse(await readFile(new URL(path,import.meta.url)));
    assert.deepEqual(missingWardrobeOptions(catalogue),[],path);
  }
});

test('build parity matches slot and option, excluding bodies and unpublished action artwork', () => {
  const entries = [
    {id:'body-regular', build:'regular', slot:'body'},
    {id:'body-slim', build:'slim', slot:'body'},
    {id:'top-shirt', build:'regular', slot:'top', optionId:'shirt'},
    {id:'outer-shirt-slim', build:'slim', slot:'outer', optionId:'shirt'},
    {id:'top-shirt-slim-wave', build:'slim', slot:'top', optionId:'shirt', poseSet:'wave'},
    {id:'top-shirt-slim-candidate', build:'slim', slot:'top', optionId:'shirt', status:'candidate'},
    {id:'face-smile', build:'regular', slot:'face', optionId:'smile', expression:'smile'},
  ].map(entry => ({status:'approved', ...entry}));
  assert.deepEqual(missingWardrobeOptions({entries}), [{build:'slim',slot:'top',optionId:'shirt',sourceId:'top-shirt',id:'top-shirt-slim'}]);
  entries.push({id:'top-shirt-slim',build:'slim',slot:'top',optionId:'shirt',status:'approved'});
  assert.deepEqual(missingWardrobeOptions({entries}), []);
});
