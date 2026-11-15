// tokens.ts is compiled before this entry point by tsconfig.json.
figma.showUI(__html__, { width: 360, height: 270, themeColors: true });
let busy = false;
figma.ui.onmessage = async (msg: { type: string; id: number }) => {
  if (msg.type !== 'collect' || busy) return;
  busy = true;
  try {
    const [collections, variables, paints, texts, effects, grids] = await Promise.all([
      figma.variables.getLocalVariableCollectionsAsync(), figma.variables.getLocalVariablesAsync(),
      figma.getLocalPaintStylesAsync(), figma.getLocalTextStylesAsync(), figma.getLocalEffectStylesAsync(), figma.getLocalGridStylesAsync(),
    ]);
    const known = new Set(variables.map(v => v.id));
    for (let i = 0; i < variables.length; i++) {
      for (const value of Object.values(variables[i].valuesByMode)) {
        if (typeof value !== 'object' || !('type' in value) || value.type !== 'VARIABLE_ALIAS' || known.has(value.id)) continue;
        const v = await figma.variables.getVariableByIdAsync(value.id);
        if (!v) throw new Error(`Missing dependency ${value.id}`);
        known.add(v.id); variables.push(v);
        if (!collections.some(c => c.id === v.variableCollectionId)) {
          const c = await figma.variables.getVariableCollectionByIdAsync(v.variableCollectionId);
          if (!c) throw new Error(`Missing collection ${v.variableCollectionId}`);
          collections.push(c);
        }
      }
    }
    const styles: StyleData[] = [
      ...paints.map(s => ({ id: s.id, name: s.name, description: s.description, kind: 'paint', data: { paints: s.paints } })),
      ...texts.map(s => ({ id: s.id, name: s.name, description: s.description, kind: 'text', data: { fontName: s.fontName, fontSize: s.fontSize, letterSpacing: s.letterSpacing, lineHeight: s.lineHeight, textCase: s.textCase, textDecoration: s.textDecoration, paragraphIndent: s.paragraphIndent, paragraphSpacing: s.paragraphSpacing, boundVariables: s.boundVariables } })),
      ...effects.map(s => ({ id: s.id, name: s.name, description: s.description, kind: 'effect', data: { effects: s.effects } })),
      ...grids.map(s => ({ id: s.id, name: s.name, description: s.description, kind: 'grid', data: { layoutGrids: s.layoutGrids } })),
    ];
    const result = convertTokens(collections, variables, styles, figma.root.name);
    figma.ui.postMessage({ type: 'collected', id: msg.id, name: figma.root.name, ...result });
  } catch (e) {
    figma.ui.postMessage({ type: 'collection-error', id: msg.id, message: e instanceof Error ? e.message : String(e), details: errorDetails(e) });
  } finally { busy = false; }
};

