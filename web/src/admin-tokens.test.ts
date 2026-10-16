import {describe,expect,it} from 'vitest';
import {renderTokenRows} from './admin-tokens';

describe('API token list',()=>{
  it('escapes names and offers revoking only for live tokens',()=>{
    const html=renderTokenRows([
      {id:'a',accountId:'x',name:'<b>laptop</b>',createdAt:'2026-10-16T08:00:00Z'},
      {id:'b',accountId:'x',name:'old',createdAt:'2026-10-01T08:00:00Z',revokedAt:'2026-10-02T08:00:00Z'},
    ]);
    expect(html).toContain('&lt;b&gt;laptop&lt;/b&gt;');
    expect(html.match(/data-revoke-token/g)).toHaveLength(1);
    expect(html).toContain('data-revoke-token="a"');
  });
});
