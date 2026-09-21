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

export async function joinSharedHost(storage:Pick<Storage,"setItem">, expectedCode?:string, request:typeof fetch=fetch){
  const response=await request("/api/rooms/current",{method:"POST",cache:"no-store"});
  if(response.status===404&&!expectedCode)return null;
  const data=await response.json() as {code?:string;hostToken?:string;inviteToken?:string;tvToken?:string|null;error?:string};
  if(!response.ok||!data.code||!data.hostToken||!data.inviteToken)throw new Error(data.error||"Couldn’t enable host controls. Please try again.");
  if(expectedCode&&expectedCode!==data.code)throw new Error("This link is for an older room. Open the Host Console from the Snax page to join tonight’s show.");
  storage.setItem(`snax-host-${data.code}`,data.hostToken);
  storage.setItem(`snax-invite-${data.code}`,data.inviteToken);
  if(data.tvToken)storage.setItem(`snax-tv-${data.code}`,data.tvToken);
  return {...data,code:data.code};
}
