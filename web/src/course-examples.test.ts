// @vitest-environment happy-dom
import {afterEach,describe,expect,it,vi} from 'vitest';
import fixtures from '../../content/alignments/fixtures.json';
import {configureContentClient,type ContentClient} from './content-api';
import {loadExerciseExample,renderCourseExample} from './course-examples';
import {courseWordDetail,renderWordDetail} from './word-detail';
import {installSentenceTranslations} from './sentence-translations';
import {setBaseLanguage} from './i18n';
import type {AlignedLine} from './aligned-line';
import type {Exercise} from './content';
import type {CourseLexeme} from './course';

let client:ContentClient|undefined;
afterEach(async()=>{client?.destroy();client=undefined;document.body.replaceChildren();await setBaseLanguage('en',{persist:false});});
const example=()=>structuredClone(fixtures.find(line=>line.fixture==='marta')!) as unknown as AlignedLine;
const exercise:Exercise={id:'00000000-0000-4000-8000-000000000001',itemId:'00000000-0000-4000-8000-000000000002',mode:'choice',prompt:'Read the request',german:'A cached prompt',english:'A cached instruction',hint:'Listen again'};

describe('authored course examples',()=>{
  it('loads only the selected example and keeps authored alignment through word detail rendering',async()=>{
    const line=example(),request=vi.fn(async()=>({lines:[line]}));
    client=configureContentClient({request:request as never},{owner:()=> 'example-test',clearRegistries:false});
    const narrative=await loadExerciseExample({...exercise,exampleLineId:line.id});
    expect(request).toHaveBeenCalledExactlyOnceWith(`/content/lines?ids=${line.id}`);
    expect(narrative?.[0].german).toBe(line.de.text);
    expect(narrative?.[0].aligned).toEqual(line);
    const word:CourseLexeme={id:'kaffee',lemma:'Kaffee',article:'der',english:'coffee',level:'A1',pos:'noun',topic:'food',sourceId:'test',sourceUrl:'https://example.com'};
    document.body.innerHTML=renderWordDetail(courseWordDetail(word,{example:narrative}));
    const dispose=installSentenceTranslations(document);
    try{
      const token=line.de.tokens.findIndex(([start,end])=>line.de.text.slice(start,end)==='Möchtest');
      document.querySelector<HTMLButtonElement>(`.word-detail-example [data-aligned-token="${token}"]`)!.click();
      expect([...document.querySelectorAll('.sentence-translation-tooltip mark')].map(mark=>mark.textContent)).toEqual(['Would','like']);
    }finally{dispose();}
  });

  it('uses the same token interaction and visible support in both grammar example containers',()=>{
    const line=example(),markup=renderCourseExample({german:line.de.text,english:line.support.en!.text,aligned:line});
    document.body.innerHTML=`<section class="grammar-route"><blockquote>${markup}</blockquote></section><div class="course-intro-examples"><p>${markup}</p></div>`;
    const dispose=installSentenceTranslations(document);
    try{
      const token=line.de.tokens.findIndex(([start,end])=>line.de.text.slice(start,end)==='Kaffee');
      for(const surface of document.querySelectorAll('.grammar-route,.course-intro-examples')){
        expect(surface.querySelector('.aligned-line-meaning')?.textContent).toBe(line.support.en!.text);
        surface.querySelector<HTMLButtonElement>(`[data-aligned-token="${token}"]`)!.click();
        expect(surface.querySelector('.aligned-line-meaning mark')?.textContent).toBe('coffee');
      }
    }finally{dispose();}
  });
});
