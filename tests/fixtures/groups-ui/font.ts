// Minimal browser font loader for the isolated component fixture (Metro export is checked separately).
const loaded=new Set<string>();
export const isLoaded=(name:string)=>loaded.has(name);
export async function loadAsync(fonts:Record<string,string>){for(const [name,uri] of Object.entries(fonts)){const font=await new FontFace(name,`url(${uri})`).load();document.fonts.add(font);loaded.add(name);}}
