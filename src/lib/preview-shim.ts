/**
 * In-memory storage polyfill for the preview sandbox.
 *
 * Preview iframes use sandbox=allow-scripts allow-forms without allow-same-origin,
 * so the real localStorage/sessionStorage APIs throw SecurityError. v1 static apps
 * rely on localStorage — this shim runs before app scripts and substitutes
 * ephemeral in-memory storage when the real APIs are unavailable.
 *
 * Isolation: storage does not persist across reloads and is not shared with the
 * parent app origin. preview-isolation.spec still uses its own HTML without this shim.
 */
export const PREVIEW_SHIM_SCRIPT = `(function(){try{localStorage.setItem("__pc_probe","1");localStorage.removeItem("__pc_probe");return}catch(e){}function makeStore(){var data={};return{getItem:function(k){return Object.prototype.hasOwnProperty.call(data,k)?data[k]:null},setItem:function(k,v){data[k]=String(v)},removeItem:function(k){delete data[k]},clear:function(){data={}},get length(){return Object.keys(data).length},key:function(i){var keys=Object.keys(data);return i>=0&&i<keys.length?keys[i]:null}}}try{Object.defineProperty(window,"localStorage",{value:makeStore(),configurable:true});Object.defineProperty(window,"sessionStorage",{value:makeStore(),configurable:true})}catch(err){}})();`;

/** Insert the preview shim as the first executable script in <head>. */
export function injectPreviewShim(html: string): string {
  const tag = `<script>${PREVIEW_SHIM_SCRIPT}</script>`;
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, (match) => `${match}\n    ${tag}`);
  }
  return `${tag}\n${html}`;
}
