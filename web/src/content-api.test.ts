import { describe, expect, it, vi } from 'vitest';
import { ContentClient, ContentUnavailable } from './content-api';
const id=(number:number)=>`00000000-0000-4000-8000-${String(number).padStart(12,'0')}`;
const line=(number:number)=>({id:id(number),de:{text:'Fahrkarte',tokens:[[0,9]]},support:{en:{text:'Ticket',tokens:[[0,6]],align:[[0,0]]}}});
function client(request:ReturnType<typeof vi.fn>,owner=()=> 'owner') {return new ContentClient({request:request as never},{owner,clearRegistries:false});}
describe('account-scoped content slices',()=>{
  it('coalesces overlapping requests and caps each line batch at twelve records',async()=>{
    const request=vi.fn(async(path:string)=>({lines:path.split('ids=')[1].split(',').map(value=>line(Number(value.slice(-12))))}));
    const content=client(request);
    const [first,second]=await Promise.all([content.lines(Array.from({length:13},(_,i)=>id(i+1))),content.lines([id(1),id(3)])]);
    expect(first).toHaveLength(13);expect(second.map(value=>value.id)).toEqual([id(1),id(3)]);
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls.every(([path])=>path.split('ids=')[1].split(',').length<=12)).toBe(true);
    await content.lines([id(1)]);expect(request).toHaveBeenCalledTimes(2);content.destroy();
  });
  it('coalesces exercise reads and keeps answer fields absent before an attempt',async()=>{
    const request=vi.fn(async()=>({id:id(1),itemId:id(2),mode:'type',prompt:'Write it',hint:'Try a greeting',german:'',support:{en:{english:'Hello'}}}));
    const content=client(request);
    const [left,right]=await Promise.all([content.exercises([id(1)]),content.exercises([id(1)])]);
    expect(request).toHaveBeenCalledTimes(1);expect(left[0]).toBe(right[0]);expect(left[0]).not.toHaveProperty('answer');expect(left[0]).not.toHaveProperty('explanation');expect(left[0].english).toBe('Hello');content.destroy();
  });
  it('rejects an old owner’s in-flight response and never caches it for the new owner',async()=>{
    let owner='first';let release!:(value:unknown)=>void;
    const request=vi.fn(()=>new Promise(resolve=>{release=resolve;}));const content=client(request,()=>owner);
    const old=content.lines([id(1)]);const rejection=expect(old).rejects.toBeInstanceOf(ContentUnavailable);
    await Promise.resolve();owner='second';expect(content.peek('lines',id(1))).toBeUndefined();release({lines:[line(1)]});await rejection;
    expect(content.peek('lines',id(1))).toBeUndefined();content.destroy();
  });
  it('evicts old records with an LRU and rejects missing records without caching them',async()=>{
    const request=vi.fn(async(path:string)=>({lines:path.split('ids=')[1].split(',').filter(value=>value!==id(99)).map(value=>line(Number(value.slice(-12))))}));const content=client(request);
    await content.lines(Array.from({length:49},(_,i)=>id(i+1)));
    expect(content.peek('lines',id(1))).toBeUndefined();expect(content.peek('lines',id(49))).toHaveProperty('id',id(49));
    await expect(content.lines([id(99)])).rejects.toBeInstanceOf(ContentUnavailable);
    await expect(content.lines([id(99)])).rejects.toBeInstanceOf(ContentUnavailable);
    expect(content.peek('lines',id(99))).toBeUndefined();content.destroy();
  });
  it('rejects readable identifiers before sending a content request',async()=>{
    const request=vi.fn();const content=client(request);await expect(content.exercises(['a1-arrival-exercise-1'])).rejects.toThrow('opaque UUID');expect(request).not.toHaveBeenCalled();content.destroy();
  });
});
