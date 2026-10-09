import {describe,expect,it}from'vitest';
import{WorldClock,worldPeriod}from'./world-clock';
describe('time selects authored animation sets',()=>{
 it('uses calm day from07:00 and calm night from19:00',()=>{expect(worldPeriod(6.999)).toBe('night');expect(worldPeriod(7)).toBe('day');expect(worldPeriod(18.999)).toBe('day');expect(worldPeriod(19)).toBe('night');expect(worldPeriod(24)).toBe('night')});
 it('advances a foreground day gradually and wraps midnight',()=>{const clock=new WorldClock({mode:'cycle',hour:23.99});const state=clock.advance(.5);expect(state.hour).toBeCloseTo(.0066667);expect(state.label).toBe('00:00');expect(state.period).toBe('night');expect(clock.advance(0).hour).toBe(state.hour)});
 it('holds a selected hour and follows local time when requested',()=>{const clock=new WorldClock({mode:'manual',hour:12.5});expect(clock.advance(50).label).toBe('12:30');clock.configure({mode:'local',hour:0});const date=new Date(2026,9,9,21,45,0);expect(clock.advance(0,date)).toMatchObject({label:'21:45',period:'night'});clock.configure({mode:'manual',hour:8});expect(clock.advance(9).period).toBe('day')});
});
