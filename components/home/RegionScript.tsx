import { EU_COUNTRY_CODES } from "@/config/games";

/**
 * Sets the visitor's region on <html> BEFORE first paint (inline script in
 * the root layout, so it applies on every page):
 *   data-home-region   ontario | quebec | british-columbia | alberta |
 *                      saskatchewan | manitoba | territories | atlantic |
 *                      usa | europe
 *   data-home-country  CA | US | EU
 * from the visitor's own choice (localStorage or the lottizen_region cookie,
 * both set by RegionSelect; "all"
 * clears it), else the lottizen_geo cookie middleware.ts writes from
 * Vercel's geo headers ("CA-ON", "US-NY", "DE-BE"). CSS then HIDES blocks
 * that belong to another region (data-region-block / data-country-scope).
 *
 * Unknown region — no choice, no geo, or a crawler — sets nothing, and
 * every block shows: every visitor and every crawler gets the same HTML,
 * and a crawler always sees all of it. No redirect, no different HTML.
 */
export function RegionScript() {
  const eu = JSON.stringify(Object.keys(EU_COUNTRY_CODES));
  const code = `(function(){try{
var d=document.documentElement;
if(/bot|crawl|spider|slurp|inspectiontool|lighthouse|headless/i.test(navigator.userAgent))return;
var r=null;try{r=localStorage.getItem('lottizen_home_region')}catch(e){}
if(!r){var k=document.cookie.match(/(?:^|; )lottizen_region=([^;]+)/);if(k)r=decodeURIComponent(k[1])}
if(r==='all')return;
if(!r){var m=document.cookie.match(/(?:^|; )lottizen_geo=([^;]+)/);if(m){var p=decodeURIComponent(m[1]).toUpperCase().split('-'),c=p[0],s=p[1]||'';
if(c==='CA'){r={ON:'ontario',QC:'quebec',BC:'british-columbia',AB:'alberta',SK:'saskatchewan',MB:'manitoba',YT:'territories',NT:'territories',NU:'territories',NB:'atlantic',NS:'atlantic',PE:'atlantic',NL:'atlantic'}[s]||'ontario'}
else if(c==='US'){r='usa'}else if(${eu}.indexOf(c)>=0||c==='GB'){r='europe'}}}
if(!r)return;
d.setAttribute('data-home-region',r);
d.setAttribute('data-home-country',r==='usa'?'US':r==='europe'?'EU':'CA');
}catch(e){}})();`;
  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}
