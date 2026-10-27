import { exercise } from "@/lib/passkey-exercise";
import { json } from "@/lib/passkey-registration";
export const dynamic="force-dynamic";
async function handle(request:Request,context:{params:Promise<{action:string}>}){
  const {action}=await context.params;
  const allowed=request.method==="GET"?["status","items","own-items"]:["register-options","register-verify","login-options","login-verify","logout","own-items"];
  if(!allowed.includes(action))return json({error:"METHOD_NOT_ALLOWED"},405);
  try{return await exercise(request,action);}catch(e){if(e instanceof Response)return e;return json({error:"EXERCISE_UNAVAILABLE",message:"시험 요청을 완료하지 못했습니다. 다시 시도하세요."},503);}
}
export const GET=handle;
export const POST=handle;
