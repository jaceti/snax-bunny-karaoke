import app from "vinext/server/fetch-handler";
import { ensureDailyReset } from "./app/daily-reset";

type Bindings={DB:D1Database};
export default {
  async fetch(request:Request,env:Bindings,ctx:ExecutionContext){
    // Catch up before room operations if the scheduled invocation was delayed.
    if(new URL(request.url).pathname.startsWith("/api/rooms")){
      try{await ensureDailyReset(env.DB);}
      catch{return Response.json({error:"The daily room refresh is reconnecting. Please try again."},{status:503,headers:{"cache-control":"no-store"}});}
    }
    const response=await app.fetch(request,env,ctx);
    if(new URL(request.url).pathname.startsWith("/api/rooms")){
      const headers=new Headers(response.headers);headers.set("x-snax-daily-reset","03:00 America/Los_Angeles");
      return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
    }
    return response;
  },
  async scheduled(_event:ScheduledController,env:Bindings){
    await ensureDailyReset(env.DB);
  },
};
