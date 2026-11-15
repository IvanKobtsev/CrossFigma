/* eslint-disable @typescript-eslint/no-unused-vars -- Shared sandbox functions are called from code.ts. */
type TokenTree = Record<string, unknown>;
interface StyleData { id: string; name: string; description: string; kind: string; data: TokenTree }
const ext = 'io.crossfigma';
function errorDetails(e: unknown, seen = new Set<unknown>()): string {
  if (seen.has(e)) return '[Circular cause]';
  seen.add(e);
  return e instanceof Error ? (e.stack || e.message) + ('cause' in e ? '\nCaused by: ' + errorDetails(e.cause, seen) : '') : String(e);
}
function escapeName(s: string): string {
  return s ? s.replace(/[%.$}{~]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase()).replace(/^__proto__$/, '%5F_proto__') : '%00';
}
function insert(tree: TokenTree, path: string[], value: TokenTree) {
  for (const key of path.slice(0, -1)) {
    if (!Object.hasOwn(tree, key)) tree[key] = {};
    tree = tree[key] as TokenTree;
    if ('$value' in tree) throw new Error(`Token path collision: ${path.join('/')}`);
  }
  const key = path[path.length - 1];
  if (Object.hasOwn(tree, key)) throw new Error(`Token path collision: ${path.join('/')}`);
  tree[key] = value;
}
function dtColor(c: RGB | RGBA, opacity = 1) {
  if (![c.r, c.g, c.b, 'a' in c ? c.a : 1, opacity].every(Number.isFinite)) throw new Error('Invalid color');
  return { colorSpace: 'srgb', components: [c.r, c.g, c.b], alpha: ('a' in c ? c.a : 1) * opacity };
}
const dimension = (value: number) => ({ value, unit: 'px' });
function convertTokens(collections: Pick<VariableCollection, 'id' | 'name' | 'modes' | 'defaultModeId'>[], variables: Pick<Variable, 'id' | 'name' | 'description' | 'variableCollectionId' | 'resolvedType' | 'valuesByMode'>[], styles: StyleData[], name: string) {
  const warnings: string[] = [], sets: TokenTree = {}, modifiers: TokenTree = {}, resolutionOrder: TokenTree[] = [];
  const paths = new Map<string, string[]>(), byId = new Map(variables.map(v => [v.id, v]));
  const collisions: TokenTree = {};
  for (const v of variables) {
    const c = collections.find(c => c.id === v.variableCollectionId);
    if (!c) throw new Error(`Missing collection for ${v.name}`);
    const path = ['variables', escapeName(c.name), ...v.name.split('/').map(escapeName)];
    insert(collisions, path, { $value: true }); paths.set(v.id, path);
  }
  const done = new Set<string>();
  function visit(id: string, active = new Set<string>()) {
    if (active.has(id)) throw new Error(`Circular alias: ${byId.get(id)?.name || id}`);
    if (done.has(id)) return;
    const v = byId.get(id);
    if (!v) throw new Error(`Missing dependency ${id}`);
    active.add(id);
    for (const value of Object.values(v.valuesByMode)) {
      if (typeof value === 'object' && 'type' in value && value.type === 'VARIABLE_ALIAS') {
        if (byId.get(value.id)?.resolvedType !== v.resolvedType) throw new Error(`Missing or incompatible alias in ${v.name}`);
        visit(value.id, active);
      }
    }
    active.delete(id); done.add(id);
  }
  variables.forEach(v => visit(v.id));
  for (const c of [...collections].sort((a, b) => a.id.localeCompare(b.id))) {
    const contexts: TokenTree = {};
    if (!c.modes.some(m => m.modeId === c.defaultModeId)) throw new Error(`Invalid modes in ${c.name}`);
    for (const mode of c.modes) {
      const tree: TokenTree = {};
      for (const v of [...variables].filter(v => v.variableCollectionId === c.id).sort((a, b) => a.id.localeCompare(b.id))) {
        let value: unknown = v.valuesByMode[mode.modeId];
        if (value === undefined) throw new Error(`Missing value: ${v.name}, ${mode.name}`);
        if (typeof value === 'object' && value && 'type' in value) value = `{${paths.get((value as VariableAlias).id)!.join('.')}}`;
        else if (v.resolvedType === 'COLOR') value = dtColor(value as RGB | RGBA);
        const type = ({ COLOR: 'color', FLOAT: 'number', STRING: 'string', BOOLEAN: 'boolean' } as Record<string, string>)[v.resolvedType];
        if (!type) throw new Error(`Unsupported variable type: ${v.resolvedType}`);
        if (typeof value === 'number' && !Number.isFinite(value)) throw new Error(`Invalid number: ${v.name}`);
        insert(tree, paths.get(v.id)!, { $type: type, $value: value, $description: v.description, $extensions: { [ext]: { id: v.id, name: v.name, collectionId: c.id, collectionName: c.name, modeId: mode.modeId, modeName: mode.name } } });
      }
      const key = escapeName(mode.name);
      if (Object.hasOwn(contexts, key)) throw new Error(`Duplicate mode name: ${c.name}`);
      contexts[key] = [tree];
    }
    const key = escapeName(c.id), pointer = key.replace(/\//g, '~1');
    if (c.modes.length === 1) { sets[key] = { sources: contexts[escapeName(c.modes[0].name)] }; resolutionOrder.push({ $ref: `#/sets/${pointer}` }); }
    else { modifiers[key] = { contexts, default: escapeName(c.modes.find(m => m.modeId === c.defaultModeId)!.name) }; resolutionOrder.push({ $ref: `#/modifiers/${pointer}` }); }
  }
  const styleTree: TokenTree = {};
  for (const s of [...styles].sort((a, b) => a.id.localeCompare(b.id))) {
    const token: TokenTree = { $description: s.description, $extensions: { [ext]: { id: s.id, name: s.name, ...s.data } } };
    const paints = s.data.paints as Paint[] | undefined, effects = s.data.effects as Effect[] | undefined;
    if (s.kind === 'paint' && paints?.length === 1 && paints[0].type === 'SOLID' && paints[0].visible !== false) {
      token.$type = 'color'; token.$value = dtColor(paints[0].color, paints[0].opacity ?? 1);
    } else if (s.kind === 'effect' && effects?.length && effects.every(e => (e.type === 'DROP_SHADOW' || e.type === 'INNER_SHADOW') && e.visible !== false)) {
      token.$type = 'shadow'; token.$value = effects.map(effect => {
        const e = effect as DropShadowEffect | InnerShadowEffect;
        return { color: dtColor(e.color), offsetX: dimension(e.offset.x), offsetY: dimension(e.offset.y), blur: dimension(e.radius), spread: dimension(e.spread ?? 0), inset: e.type === 'INNER_SHADOW' };
      });
    } else if (s.kind === 'text') {
      const font = s.data.fontName as FontName, size = s.data.fontSize as number, spacing = s.data.letterSpacing as LetterSpacing, height = s.data.lineHeight as LineHeight;
      const weights: Record<string, number> = { thin: 100, extralight: 200, light: 300, regular: 400, normal: 400, medium: 500, semibold: 600, bold: 700, extrabold: 800, black: 900 };
      const weight = weights[font.style.toLowerCase().replace(/[ -]/g, '').replace('italic', '') || 'regular'];
      if (weight !== undefined && height.unit !== 'AUTO') {
        token.$type = 'typography'; token.$value = { fontFamily: font.family, fontSize: dimension(size), fontWeight: weight, letterSpacing: dimension(spacing.unit === 'PIXELS' ? spacing.value : spacing.value / 100 * size), lineHeight: height.unit === 'PERCENT' ? height.value / 100 : height.value / size };
      }
    }
    if (!token.$type) warnings.push(`${s.name}: ${s.kind} style preserved as Figma metadata.`);
    else if (s.kind === 'text') warnings.push(`${s.name}: additional text properties preserved as Figma metadata.`);
    insert(styleTree, ['styles', s.kind, ...s.name.split('/').map(escapeName)], token);
  }
  sets.styles = { sources: [styleTree] }; resolutionOrder.push({ $ref: '#/sets/styles' });
  return { document: { $schema: 'https://www.designtokens.org/schemas/2025.10/resolver.json', version: '2025.10', name, sets, modifiers, resolutionOrder }, warnings };
}


