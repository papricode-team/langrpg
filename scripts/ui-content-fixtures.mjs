// Read-only adapter for the checked-in bounded public preview records.
const hiddenFields=new Set(['slug','localid','legacyid','answer','acceptedanswers','explanation','orderexplanation','expected','correct','correctanswer','correctedanswer','modelanswer','validvalues','solutions','solution','owners','authoring','response','answers','canonical']);
function safe(value,language,parent='') {
 if(Array.isArray(value))return value.map(item=>safe(item,language,parent));
 if(!value||typeof value!=='object')return value;
 const result={};
 for(const [key,child]of Object.entries(value)) {
  if(hiddenFields.has(key.toLowerCase())||(key==='grading'&&parent!=='course'))continue;
  if(['translations','meanings','glosses','support'].includes(parent)||parent.endsWith('Translations'))if(key!==language)continue;
  result[key]=safe(child,language,key);
 }
 return result;
}
export function uiContentFixtures(fixture,{language='en'}={}) {
 if(!Array.isArray(fixture.records)||!fixture.bootstrapId)throw new Error('Use the bounded public content fixture, not a private content catalog.');
 const records=new Map(fixture.records.map(record=>[record.id,record]));
 const bootstrap=records.get(fixture.bootstrapId);
 if(!bootstrap||bootstrap.kind!=='bootstrap')throw new Error('Missing public fixture bootstrap.');
 const previewWordIds=fixture.records.filter(record=>record.kind==='lexeme'&&record.body.level==='A1').slice(0,24).map(record=>record.id);
 return (href,method='GET')=>{
  if(method!=='GET')return{status:405,body:{error:'Screenshot fixtures are read-only.'}};
  const url=new URL(href,'http://fixture.local'),match=/^\/api\/content\/([a-z]+)(?:\/([0-9a-f-]+))?$/.exec(url.pathname);
  if(!match)return{status:404,body:{}};
  const[,kind,id]=match;
  if(kind==='bootstrap'&&!id)return{status:200,body:safe({...bootstrap,body:{...bootstrap.body,previewWordIds}},language)};
  const kinds={sentences:'sentence',lexemes:'lexeme',contexts:'context',exercises:'exercise',units:'unit',graphs:'graph',expeditions:'expedition',minigames:'minigame'};
  if(!kinds[kind])return{status:404,body:{}};
  if(id){const record=records.get(id);return record?.kind===kinds[kind]?{status:200,body:safe(record,language)}:{status:404,body:{}};}
  if(!['sentences','lexemes'].includes(kind))return{status:404,body:{}};
  const ids=(url.searchParams.get('ids')??'').split(',');
  if(!ids[0]||ids.length>(kind==='sentences'?12:24))return{status:400,body:{error:'Invalid preview batch size.'}};
  return{status:200,body:{records:[...new Set(ids)].map(id=>records.get(id)).filter(record=>record?.kind===kinds[kind]).map(record=>safe(record,language))}};
 };
}
