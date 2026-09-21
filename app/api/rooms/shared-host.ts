// The public Squarespace host entry intentionally lets any visitor join as host.
// Derive a stable, room-specific co-host credential without replacing the
// original host's credential or changing the room/queue. Never expose the stored hash.
export async function sharedHostToken(code:string, storedHostHash:string){
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(storedHostHash),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const signature=await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(`snax-shared-host-v1:${code}`));
  return Array.from(new Uint8Array(signature),byte=>byte.toString(16).padStart(2,"0")).join("");
}

export async function hostTokenMatches(code:string, storedHostHash:string, token:string){
  if(!token||!storedHostHash)return false;
  const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(token));
  const tokenHash=Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,"0")).join("");
  return tokenHash===storedHostHash||token===await sharedHostToken(code,storedHostHash);
}
