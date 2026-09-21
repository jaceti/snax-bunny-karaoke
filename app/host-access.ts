// Host access is a private bearer link, separate from the public singer QR.
// The secret stays in the fragment so it is not sent in URLs to the server.
export function hostShareLink(origin:string, code:string, token:string){
  if(!code||!token)return "";
  const url=new URL("/",origin);
  url.searchParams.set("host",code);
  url.hash=new URLSearchParams({hostKey:token}).toString();
  return url.toString();
}

export async function acceptHostInvite(code:string, token:string, storage:Pick<Storage,"setItem">, request:typeof fetch=fetch){
  const response=await request(`/api/rooms/${encodeURIComponent(code)}`,{cache:"no-store",headers:{"x-host-token":token}});
  if(!response.ok)throw new Error("This host invitation could not be verified. Ask the host to share their private host QR again.");
  storage.setItem(`snax-host-${code}`,token);
}
