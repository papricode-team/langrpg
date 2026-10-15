/** A prefab copy moved as a whole keeps its origin and baselines with it. */
function preservePrefabPlacement(before, after) {
  if (!before.prefabInstances?.length) return after;
  return {...after, prefabInstances: before.prefabInstances.map(instance => {
    const pairs = instance.members.map(member => ({before: before.scenery.find(item => item.id === member.id), after: after.scenery.find(item => item.id === member.id)})).filter(pair => pair.before && pair.after);
    if (!pairs.length) return instance;
    const dx = pairs[0].after.x - pairs[0].before.x, dy = pairs[0].after.y - pairs[0].before.y;
    if ((dx === 0 && dy === 0) || pairs.some(pair => Math.abs(pair.after.x - pair.before.x - dx) > 1e-8 || Math.abs(pair.after.y - pair.before.y - dy) > 1e-8)) return instance;
    return {...instance, origin: {x: instance.origin.x + dx, y: instance.origin.y + dy}, members: instance.members.map(member => ({...member, base: {...member.base, x: member.base.x + dx, y: member.base.y + dy}}))};
  })};
}
import './register-content-loader.mjs';
const {withSceneryCollision} = await import('../web/src/placed-scenery.ts');
import {getSceneryGeometryMap} from '../web/src/scene-schema.ts';
import {terrainFeature,featureBounds} from '../web/src/terrain-features.ts';
/** Tiled v2 interchange. Source records remain lossless, with native editable geometry. */
const omit = (value, keys) => Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)));
const property = (name, value) => ({name, type: typeof value === 'number' ? Number.isInteger(value) ? 'int' : 'float' : typeof value === 'boolean' ? 'bool' : 'string', value});
function properties(record) {
  const json = Object.keys(record).filter(key => record[key] !== null && typeof record[key] === 'object');
  return [...Object.entries(record).map(([key, value]) => property(key, json.includes(key) ? JSON.stringify(value) : value)), ...(json.length ? [property('_jsonFields', JSON.stringify(json))] : [])];
}
function readProperties(values = []) {
  const result = {}, seen = new Set();
  for (const {name, value} of values) {
    if (seen.has(name)) throw new Error(`Duplicate Tiled property ${name}`);
    if (['__proto__', 'constructor', 'prototype'].includes(name)) throw new Error(`Unsupported Tiled property ${name}`);
    seen.add(name); result[name] = value;
  }
  const json = JSON.parse(result._jsonFields ?? '[]'); delete result._jsonFields;
  for (const key of json) if (result[key] !== undefined) result[key] = JSON.parse(result[key]);
  return result;
}
const worldPoint = (object, layer) => ({x: object.x + (layer.offsetx ?? 0), y: object.y + (layer.offsety ?? 0)});
function objectPolygon(object, layer) {
  const origin = worldPoint(object, layer), angle = (object.rotation ?? 0) * Math.PI / 180;
  let vertices = object.polygon;
  if (!vertices && object.ellipse) vertices = Array.from({length: 18}, (_, i) => ({x: object.width / 2 + Math.cos(i / 18 * Math.PI * 2) * object.width / 2, y: object.height / 2 + Math.sin(i / 18 * Math.PI * 2) * object.height / 2}));
  if (!vertices && object.width > 0 && object.height > 0 && !object.polyline && !object.gid) vertices = [{x: 0, y: 0}, {x: object.width, y: 0}, {x: object.width, y: object.height}, {x: 0, y: object.height}];
  if (!vertices) throw new Error(`${object.name} needs a polygon, rectangle or ellipse`);
  return vertices.map(vertex => [origin.x + vertex.x * Math.cos(angle) - vertex.y * Math.sin(angle), origin.y + vertex.x * Math.sin(angle) + vertex.y * Math.cos(angle)]);
}

export function sceneToTiled(mapId, document, {images = {}, imagePath = asset => `../../web/public${asset}`} = {}) {
  const scene = document.maps[mapId]; if (!scene) throw new Error(`Unknown map ${mapId}`);
  let nextId = 1, nextTile = 0;
  const tiles = [], tileIds = new Map();
  const tile = (info, defaults) => {
    const signature = JSON.stringify([info, defaults]);
    if (tileIds.has(signature)) return tileIds.get(signature);
    const id = nextTile++;
    tiles.push({id, image: imagePath(info.asset), imagewidth: info.imageWidth, imageheight: info.imageHeight,
      ...(info.frame ? {x: info.frame.x, y: info.frame.y, width: info.frame.w, height: info.frame.h} : {}),
      properties: properties({...defaults, _pivotX: info.originX ?? 0, _pivotY: info.originY ?? 0,
        _sourceWidth: info.frame?.w ?? info.imageWidth, _sourceHeight: info.frame?.h ?? info.imageHeight,
        _referenceWidth: info.referenceWidth ?? info.frame?.w ?? info.imageWidth})});
    tileIds.set(signature, id + 1); return id + 1;
  };
  const layer = (name, objects, extra = {}) => ({id: nextId++, name, type: 'objectgroup', visible: true, ...extra, objects});
  const point = value => ({id: nextId++, name: value.id, point: true, x: value.x, y: value.y, properties: properties({key: value.id, ...omit(value, ['id', 'x', 'y'])})});
  const shape = (value, label) => ({id: nextId++, name: value.id ?? label, x: 0, y: 0, polygon: value.polygon.map(([x, y]) => ({x, y})), properties: properties(value.id ? {key: value.id, ...omit(value, ['id', 'polygon'])} : {})});
  const terrain = scene.terrain.map(value => {
    const info = images.terrain?.[value.dayAsset] ?? {asset: value.dayAsset, imageWidth: value.width, imageHeight: value.height};
    return {id: nextId++, name: value.id, x: value.x, y: value.y, width: value.width, height: value.height,
      gid: tile(info, {dayAsset: value.dayAsset}), properties: properties({key: value.id, ...omit(value, ['id', 'x', 'y', 'width', 'height', 'dayAsset'])})};
  });
  const scenery = scene.scenery.map(value => {
    const info = images.scenery?.[value.id];
    if (!info) return point(value);
    const width = value.width * info.frame.w / info.referenceWidth, height = value.width * info.frame.h / info.referenceWidth;
    const gid = tile(info, {asset: value.asset, ...(value.frame ? {frame: value.frame} : {}), ...(value.variant !== undefined ? {variant: value.variant} : {})});
    return {id: nextId++, name: value.id, x: value.x - info.originX * width, y: value.y - info.originY * height, width, height,
      gid: value.flipX ? (gid | 0x80000000) >>> 0 : gid,
      properties: properties({key: value.id, ...omit(value, ['id', 'x', 'y', 'width', 'asset', 'frame', 'variant', 'flipX']),
        _sourceX: value.x, _sourceY: value.y, _sourceObjectWidth: value.width, _sourceDisplayX: value.x - info.originX * width, _sourceDisplayY: value.y - info.originY * height,
        _sourceDisplayWidth: width, _explicitFlip: value.flipX !== undefined})};
  });
  const ownedPoints = values => values.map(value => {
    const owner = scene.scenery.find(item => item.id === value.ownerId);
    if (!owner) throw new Error(`Attachment ${value.id} has no owner`);
    const x = owner.x + value.offsetX, y = owner.y + value.offsetY;
    return {...point({...value, x, y}), properties: properties({key: value.id, ...omit(value, ['id']), _sourceX: x, _sourceY: y,
      _ownerSourceWidth:owner.width,_ownerSourceFlip:!!owner.flipX})};
  });
  const activities = ownedPoints(scene.activities ?? []);
  const layers = [layer('Terrain', terrain, {locked: true,...(scene.modularTerrain?{visible:false}:{})}),
    ...(scene.modularTerrain?[layer('Terrain surfaces',scene.modularTerrain.surfaces.map(value=>shape(value)),{opacity:.7})]:[]),
    ...(scene.modularTerrain?.features?[layer('Painted terrain',scene.modularTerrain.features.map(value=>{
      const art=terrainFeature(value.asset),bounds=featureBounds(value);
      return {id:nextId++,name:value.id,...bounds,gid:tile({asset:art.asset,imageWidth:art.width,imageHeight:art.height},{terrainArt:value.asset}),properties:properties({key:value.id})};
    }))]:[]),
    layer('Walkable', scene.walkable.map((polygon, i) => shape({polygon}, `walkable-${i + 1}`)), {color: '#7700aa55', opacity: .35}),
    layer('Obstacles', scene.obstacles.map((polygon, i) => shape({polygon}, `obstacle-${i + 1}`)), {color: '#77dd5544', opacity: .35}),
    ...(scene.navigation?[layer('Terrain collision',scene.navigation.terrainCollision.map(value=>shape(value)),{color:'#77dd8844',opacity:.35})]:[]),
    layer('Scenery', scenery), layer('Spawn', [point({id: 'spawn', ...scene.spawn})]), layer('NPCs', scene.npcs.map(point)), layer('Objects', scene.objects.map(point)),
    layer('Districts', scene.districts.map(value => shape(value)), {opacity: .25}), layer('Activities', activities),
    layer('Generation zones', (scene.generationZones ?? []).map(value => shape(value)), {opacity: .2})];
  const metadata = {...omit(scene, ['id', 'width', 'height', 'walkable', 'obstacles', 'scenery', 'spawn', 'npcs', 'objects', 'terrain', 'districts', 'activities', 'generationZones']),
    ...(scene.navigation?{navigation:{model:scene.navigation.model}}:{})};
  return {type: 'map', version: '1.10', tiledversion: '1.12.2', orientation: 'orthogonal', renderorder: 'right-down', infinite: false,
    width: scene.width, height: scene.height, tilewidth: 1, tileheight: 1, nextobjectid: nextId, nextlayerid: nextId,
    properties: properties({mapId, navigationVersion: 2, ...metadata, _optionalCollections: ['activities', 'generationZones'].filter(key => scene[key] !== undefined)}), layers,
    tilesets: [{firstgid: 1, name: `${mapId}-scene-images`, columns: 0, objectalignment: 'topleft', tilewidth: Math.max(...tiles.map(value => value.width ?? value.imagewidth)), tileheight: Math.max(...tiles.map(value => value.height ?? value.imageheight)), tilecount: tiles.length, tiles}]};
}

export function sceneFromTiled(tiled, document) {
  const metadata = readProperties(tiled.properties), mapId = metadata.mapId;
  if (!document.maps[mapId]) throw new Error('Tiled mapId must name an existing world scene');
  if (metadata.navigationVersion !== 2 || tiled.orientation !== 'orthogonal' || tiled.infinite) throw new Error('Expected finite orthogonal scene version 2');
  const names = ['Painted terrain', 'Terrain surfaces', 'Terrain', 'Walkable', 'Obstacles', 'Scenery', 'Spawn', 'NPCs', 'Objects', 'Districts', 'Activities', 'Generation zones', 'Entrances'];
  const groups = new Map();
  for (const layer of tiled.layers ?? []) {
    if (layer.type !== 'objectgroup' || ![...names,'Terrain collision'].includes(layer.name) || groups.has(layer.name) || !Array.isArray(layer.objects)) throw new Error(`Unsupported or duplicate Tiled layer ${layer.name}`);
    if (layer.properties?.length || (layer.parallaxx ?? 1) !== 1 || (layer.parallaxy ?? 1) !== 1) throw new Error(`Unsupported custom/parallax properties on layer ${layer.name}`);
    for (const object of layer.objects) {
      if (object.template) throw new Error(`Resolve Tiled template ${object.template} before import`);
      if (object.text || object.polyline || object.capsule) throw new Error(`Unsupported object shape ${object.name}`);
      if ((object.opacity ?? 1) !== 1 || object.visible === false) throw new Error(`Object visibility/opacity is unsupported for ${object.name}; hide the editor layer instead`);
    }
    groups.set(layer.name, layer);
  }
  // Pre-entrance v2 exports stored unfamiliar collections in map metadata.
  if (groups.get('Entrances')?.objects.length) throw new Error('Doors now belong to buildings. Remove the Entrances layer and set the room in the building\'s interior property.');
  for (const name of names) if (name !== 'Entrances' && (name !== 'Terrain surfaces'||metadata.modularTerrain) && (name!=='Painted terrain'||metadata.modularTerrain?.features) && !groups.has(name)) throw new Error(`Missing Tiled layer ${name}`);
  if(!metadata.modularTerrain&&groups.has('Terrain surfaces'))throw new Error('Terrain surfaces need modular terrain metadata');
  if(!metadata.modularTerrain&&groups.has('Painted terrain'))throw new Error('Painted terrain needs modular terrain metadata');
  if(metadata.navigation&&!groups.has('Terrain collision'))throw new Error('Missing Tiled layer Terrain collision');
  if(!metadata.navigation&&groups.has('Terrain collision'))throw new Error('Terrain collision needs a clear-land navigation model');
  const imageInfo = object => {
    if (!Number.isInteger(object.gid) || !object.gid) throw new Error(`${object.name} needs a registered image tile`);
    if ((object.gid & 0x70000000) !== 0) throw new Error(`${object.name} uses an unsupported tile flip/rotation`);
    const gid = (object.gid & 0x0fffffff) >>> 0;
    const tileset = [...(tiled.tilesets ?? [])].reverse().find(value => value.firstgid <= gid);
    if (!tileset || tileset.source || tileset.objectalignment !== 'topleft') throw new Error(`${object.name} needs an embedded top-left-aligned image tileset`);
    const tile = tileset.tiles?.find(value => value.id === gid - tileset.firstgid);
    if (!tile) throw new Error(`${object.name} refers to a missing image tile`);
    return readProperties(tile.properties);
  };
  const parseRecord = object => {
    const value = readProperties(object.properties), id = value.key ?? object.name;
    delete value.key; return {id, ...value};
  };
  const objects = (name, convert) => { const group = groups.get(name); return group.objects.map(object => convert(object, group)); };
  const collision = name => objects(name, (object, group) => {
    if (object.properties?.length) throw new Error(`${name} polygons cannot carry custom properties; use a district or generation zone`);
    return objectPolygon(object, group);
  });
  const points = name => objects(name, (object, group) => {
    if (!object.point || object.rotation) throw new Error(`${name} placements must be unrotated point objects`);
    return {...parseRecord(object), ...worldPoint(object, group)};
  });
  const terrain = objects('Terrain', (object, group) => {
    if (object.rotation || (object.gid & 0x80000000) !== 0) throw new Error('Terrain rotation/flips are unsupported');
    const tile = imageInfo(object);
    return {...parseRecord(object), ...worldPoint(object, group), width: object.width, height: object.height, dayAsset: tile.dayAsset};
  });
  const refreshSceneryCollision = result => {
    const source = document.maps[mapId].scenery.find(item => item.id === result.id);
    // Tiled carries the old collider as a property even when the artwork changes.
    // An explicit collider edit takes precedence over refreshing the asset base.
    if (source?.collision !== undefined && (source.asset !== result.asset || source.frame !== result.frame)
      && JSON.stringify(source.collision) === JSON.stringify(result.collision)) {
      delete result.collision;
      return withSceneryCollision(result, getSceneryGeometryMap(mapId));
    }
    return result;
  };
  // A room's custom return point scales and mirrors with its building, like its painted door.
  const scaleRoom = result => {
    const source = document.maps[mapId].scenery.find(item => item.id === result.id);
    const offset = result.interior?.returnOffset;
    if (!source || !offset) return result;
    const scale = result.width / source.width, mirror = !!source.flipX === !!result.flipX ? 1 : -1;
    if (scale === 1 && mirror === 1) return result;
    return {...result, interior: {...result.interior, returnOffset: {x: offset.x * scale * mirror, y: offset.y * scale}}};
  };
  const scenery = objects('Scenery', (object, group) => {
    if (object.rotation) throw new Error(`${object.name}: use an authored facing variant instead of rotating scenery`);
    if (object.point) return refreshSceneryCollision(scaleRoom({...parseRecord(object), ...worldPoint(object, group)}));
    const info = imageInfo(object), value = parseRecord(object), position = worldPoint(object, group);
    if (Math.abs(object.width / info._sourceWidth - object.height / info._sourceHeight) > 1e-7) throw new Error(`${object.name}: scenery must keep its painted aspect ratio`);
    const result = {...omit(info, ['_pivotX', '_pivotY', '_sourceWidth', '_sourceHeight', '_referenceWidth']), ...omit(value, ['_sourceX', '_sourceY', '_sourceObjectWidth', '_sourceDisplayX', '_sourceDisplayY', '_sourceDisplayWidth', '_explicitFlip']),
      x: position.x === value._sourceDisplayX && object.width === value._sourceDisplayWidth ? value._sourceX : position.x + info._pivotX * object.width,
      y: position.y === value._sourceDisplayY && object.width === value._sourceDisplayWidth ? value._sourceY : position.y + info._pivotY * object.height,
      width: object.width === value._sourceDisplayWidth ? value._sourceObjectWidth : object.width / info._sourceWidth * info._referenceWidth};
    if (value._explicitFlip || (object.gid & 0x80000000) !== 0) result.flipX = (object.gid & 0x80000000) !== 0;
    return refreshSceneryCollision(scaleRoom(result));
  });
  const ownedPoints = name => objects(name, (object, group) => {
    if (!object.point || object.rotation) throw new Error(`${name} must be unrotated points`);
    const value = parseRecord(object), position = worldPoint(object, group), owner = scenery.find(item => item.id === value.ownerId);
    if (!owner) throw new Error(`Attachment ${value.id} has missing owner ${value.ownerId}`);
    const scale=owner.width/(value._ownerSourceWidth??owner.width),mirror=(value._ownerSourceFlip??!!owner.flipX)===!!owner.flipX?1:-1;
    const transform=point=>({x:point.x*scale*mirror,y:point.y*scale});
    return {...omit(value, ['_sourceX', '_sourceY', '_ownerSourceWidth', '_ownerSourceFlip']),
      offsetX: position.x === value._sourceX ? value.offsetX*scale*mirror : position.x - owner.x,
      offsetY: position.y === value._sourceY ? value.offsetY*scale : position.y - owner.y,
      ...Object.fromEntries(['approach','exit','returnOffset'].filter(key=>value[key]).map(key=>[key,transform(value[key])])),...(value.places?{places:value.places.map(transform)}:{})};
  });
  const activities = ownedPoints('Activities');
  const spawn = points('Spawn'); if (spawn.length !== 1) throw new Error('Spawn needs exactly one point');
  const optional = metadata._optionalCollections ?? [];
  const generationZones = objects('Generation zones', (object, group) => ({...parseRecord(object), polygon: objectPolygon(object, group)}));
  const next = structuredClone(document);
  next.maps[mapId] = {...omit(metadata, ['mapId', 'navigationVersion', '_optionalCollections']), id: mapId,
    width: tiled.width * tiled.tilewidth, height: tiled.height * tiled.tileheight,
    ...(metadata.modularTerrain?{modularTerrain:{...metadata.modularTerrain,surfaces:objects('Terrain surfaces',(object,group)=>({...parseRecord(object),polygon:objectPolygon(object,group)})),
      ...(groups.has('Painted terrain')?{features:objects('Painted terrain',(object,group)=>{
        if(object.rotation||(object.gid&0x80000000)!==0)throw new Error('Painted terrain preserves its camera: rotation/flips are unsupported');
        const asset=imageInfo(object).terrainArt,art=terrainFeature(asset);
        if(!art||Math.abs(object.height-object.width*art.height/art.width)>.01)throw new Error('Painted terrain must preserve its native aspect ratio');
        return {...parseRecord(object),...worldPoint(object,group),asset,width:object.width};
      })}:{})}}:{}),
    terrain, scenery, spawn: omit(spawn[0], ['id']), npcs: points('NPCs'), objects: points('Objects'),
    walkable: collision('Walkable'), obstacles: collision('Obstacles'),
    ...(metadata.navigation?{navigation:{...metadata.navigation,terrainCollision:objects('Terrain collision',(object,group)=>({...parseRecord(object),polygon:objectPolygon(object,group)}))}}:{}),
    districts: objects('Districts', (object, group) => ({...parseRecord(object), polygon: objectPolygon(object, group)})),
    ...(optional.includes('activities') || activities.length ? {activities} : {}),
    ...(optional.includes('generationZones') || generationZones.length ? {generationZones} : {})};
  next.maps[mapId]=preservePrefabPlacement({...document.maps[mapId],prefabInstances:next.maps[mapId].prefabInstances},next.maps[mapId]);
  return next;
}
