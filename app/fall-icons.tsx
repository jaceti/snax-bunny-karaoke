// Original code-native cut-paper illustrations, matching the seasonal wheel.
export type FallKind='turkey'|'pumpkin'|'pie'|'apple'|'corn';
export const FALL_KINDS:FallKind[]=['turkey','pumpkin','pie','apple','corn'];
export function FallIcon({kind,className}:{kind:FallKind;className?:string}){
  return <svg className={className} viewBox="0 0 100 100" aria-hidden="true" fill="none" stroke="#40291e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    {kind==='turkey'?<>
      {[-60,-30,0,30,60].map((angle,i)=><ellipse key={angle} cx="50" cy="35" rx="12" ry="29" transform={`rotate(${angle} 50 66)`} fill={['#ac4930','#d8a14b','#7e8044','#d8a14b','#ac4930'][i]}/>)}
      <path d="m42 83-3 11m20-11 3 11M33 94h12m11 0h12"/><ellipse cx="50" cy="66" rx="24" ry="23" fill="#8b542e"/>
      <path d="M35 63q12-6 16 11-13 6-16-11Z" fill="#c47c3d"/><path d="M51 61q-5-20 1-31c5-6 17-2 16 8l-8 19" fill="#b94d34"/>
      <path d="m65 38 12 5-12 5Z" fill="#e3b54f"/><circle cx="60" cy="36" r="2" fill="#40291e" stroke="none"/><path d="M65 44q7 13-1 14-5-1-2-10" fill="#ac4930"/>
    </>:kind==='pumpkin'?<><path d="m49 25 3-17 10 2-8 19" fill="#7e8044"/><path d="M51 27C17 10 5 46 15 71c7 19 27 22 36 15 12 7 33 3 38-16C98 42 80 13 51 27Z" fill="#cb783b"/><ellipse cx="50" cy="57" rx="17" ry="31" fill="#e49a50"/><path d="M30 32q-15 30 0 48m40-48q15 30 0 48" stroke="#9b532c"/></>:kind==='apple'?<><path d="M50 30q-3-14 4-22" strokeWidth="5"/><path d="M55 22q4-21 28-11-6 19-28 11Z" fill="#7e8044"/><path d="M51 31C25 12 9 40 19 65c7 21 18 31 31 21 17 12 29-4 33-24 9-30-10-47-32-31Z" fill="#b94d34"/><path d="M31 39q-10 7-7 18" stroke="#e0a35d" strokeWidth="5"/></>:kind==='pie'?<><path d="m12 47 66-25 13 36-64 24Z" fill="#db9b50"/><path d="m12 47 15 35 64-24-8-17-59 23Z" fill="#bc642e"/><path d="m13 47 65-25 6 20-60 22Z" fill="#e8b86a"/><path d="m77 23 4-6 5 5 1 7 5 3-1 8 5 5-4 7 2 7" stroke="#9a6538" strokeWidth="6"/><path d="M42 39c-6-9 7-9 7-16 5 6 16 8 8 15 10 9-20 12-15 1Z" fill="#f6ebc8"/></>:<><path d="M43 15q7-11 14 0l30 63q5 11-8 12H22q-12-1-7-12Z" fill="#e3b54f"/><path d="m31 41 12-26q7-11 14 0l12 26Z" fill="#f5ebc9" stroke="none"/><path d="m31 41-13 29h65L69 41Z" fill="#cc7938" stroke="none"/><path d="M43 15q7-11 14 0l30 63q5 11-8 12H22q-12-1-7-12Z"/></>}
  </svg>;
}
export function FallGarland(){return <div className="fall-garland" aria-hidden="true">{FALL_KINDS.map(kind=><FallIcon key={kind} kind={kind}/>)}</div>;}
