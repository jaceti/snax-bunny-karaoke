// Small, code-native silhouettes stay crisp even on a large TV.
export function Skeleton({className}:{className?:string}){
  return <svg className={className} viewBox="0 0 48 80" fill="none" aria-hidden="true">
    <g stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path fill="currentColor" d="M14 13C14 1 34 1 34 13c0 5-3 8-6 9v5h-8v-5c-4-2-6-5-6-9Z"/>
      <path d="M24 28v27m-12-24 12 4 12-4M13 37l11 4 11-4M15 43l9 4 9-4M17 51l7 5 7-5M12 31 5 42l8 8m23-19 6-12-7-7M20 55 12 65l-4 11m20-21 7 10 7 8M8 76H3m39-3 3-2"/>
    </g>
    <g fill="#272725"><ellipse cx="19.5" cy="13" rx="3" ry="3.5"/><ellipse cx="28.5" cy="13" rx="3" ry="3.5"/><path d="m24 17-2 4h4Z"/></g>
    <path d="M21 23v3m6-3v3" stroke="#272725" strokeWidth="1.5"/>
  </svg>;
}
export function SpookyBats(){
  return <svg className="spooky-bats" viewBox="0 0 180 65" aria-hidden="true" fill="currentColor"><path d="M5 8c19 18 30 19 42 7l3-9 6 8 8-5-1 11c13 13 25 10 43-6-4 24-16 19-23 35-8-13-19-12-27 0-8-15-17-14-25-9C26 21 14 31 5 8ZM108 7c11 10 16 11 23 4l2-6 4 5 5-3-1 7c8 8 15 6 26-3-3 14-10 11-14 21-5-8-11-7-16 0-5-9-10-8-15-5-3-11-10-5-14-20Z"/></svg>;
}
