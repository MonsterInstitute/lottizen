import { EU_COUNTRY_CODES } from "@/config/games";

/**
 * Picks the visitor's region BEFORE first paint (inline script, no flash):
 * their saved choice (localStorage, set by RegionPicker) first, else the
 * lottizen_geo cookie middleware.ts writes from Vercel's geo headers
 * ("CA-ON", "US-NY", "DE-BE"), else Ontario. It only sets
 * <html data-home-region>; CSS shows that region's block. Every visitor and
 * every crawler gets the same HTML with every region in it — no redirect, no
 * user-agent sniffing.
 */
export function RegionScript() {
  const eu = JSON.stringify(Object.keys(EU_COUNTRY_CODES));
  const code = `(function(){try{
var r=null;try{r=localStorage.getItem('lottizen_home_region')}catch(e){}
if(!r){var m=document.cookie.match(/(?:^|; )lottizen_geo=([^;]+)/);if(m){var p=decodeURIComponent(m[1]).toUpperCase().split('-'),c=p[0],s=p[1]||'';
if(c==='CA'){r={ON:'ontario',QC:'quebec',BC:'british-columbia',AB:'western',SK:'western',MB:'western',YT:'western',NT:'western',NU:'western',NB:'atlantic',NS:'atlantic',PE:'atlantic',NL:'atlantic'}[s]||'ontario'}
else if(c==='US'){r='usa'}else if(${eu}.indexOf(c)>=0||c==='GB'){r='europe'}}}
document.documentElement.setAttribute('data-home-region',r||'ontario');
}catch(e){}})();`;
  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}
