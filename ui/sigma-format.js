import{p as u}from"./sigma.js?v=mug36m18";/**
 * @license lucide-react v0.475.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const c=[["path",{d:"M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z",key:"1a8usu"}],["path",{d:"m15 5 4 4",key:"1mk7zo"}]],s=u("Pencil",c),i=["א׳","ב׳","ג׳","ד׳","ה׳","ו׳","ש׳"];function f(t){const n=Math.max(0,Math.round(t)),a=Math.floor(n/60),e=n%60;return a?e?`${a} ש׳ ${e} ד׳`:`${a} ש׳`:`${e} ד׳`}function g(t,n=new Date){const a=r=>new Date(r.getFullYear(),r.getMonth(),r.getDate()).getTime(),e=Math.round((a(n)-a(t))/864e5);if(e===0)return"היום";if(e===1)return"אתמול";if(e>1&&e<=6)return`יום ${i[t.getDay()]}`;const o=`${t.getDate()}.${t.getMonth()+1}`;return t.getFullYear()===n.getFullYear()?o:`${o}.${String(t.getFullYear()).slice(2)}`}export{s as P,g as a,f};
