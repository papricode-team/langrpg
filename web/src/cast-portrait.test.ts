import {expect,it} from 'vitest';
import {castPortraitMarkup} from './cast-portrait';

it('uses native painted expressions and falls back to the painted neutral portrait',()=>{
  expect(castPortraitMarkup('marta','','worried')).toContain('marta-worried.webp');
  expect(castPortraitMarkup('marta','','unknown')).toContain('marta-neutral.webp');
  expect(castPortraitMarkup('marta')).toContain('width="724" height="724"');
  expect(castPortraitMarkup('unpublished')).toBeNull();
});
