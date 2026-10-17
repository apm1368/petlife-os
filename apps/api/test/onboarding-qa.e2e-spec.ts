import type { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type Redis from "ioredis";
import { REDIS_CLIENT } from "../src/common/redis/redis.module";
import request from "supertest";
import { createTestApp, extractCookie } from "./test-app";
import { signSessionCookie } from "../src/common/session/session-cookie.util";
import { PrismaService } from "../src/common/prisma/prisma.service";

type Actor = { id: string; cookie: string; csrf: string };
describe("Onboarding QA ownership and retries", () => {
 let app: INestApplication, db: PrismaService;
 const send=(a:Actor,path:string,method:"post"|"put"="post")=>request(app.getHttpServer())[method](path).set("Cookie",a.cookie).set("x-csrf-token",a.csrf);
 async function actor():Promise<Actor>{
  const u=await db.user.create({data:{displayName:"QA",email:`qa-${randomUUID()}@example.com`}});
  const session=await db.session.create({data:{userId:u.id,expiresAt:new Date(Date.now()+86400000)}});
  const res=await request(app.getHttpServer()).get("/health/live");const csrf=extractCookie(res.headers["set-cookie"],"petlife_csrf")!;
  return {id:u.id,csrf,cookie:`petlife_session=${signSessionCookie(session.id,process.env.SESSION_SECRET!)}; petlife_csrf=${csrf}`};
 }
 const hh=async(a:Actor)=>(await send(a,"/households").send({}).expect(201)).body;
 const progress=(householdId:string,petId?:string)=>({chapter:"PET_IDENTITY",step:"age",status:"IN_PROGRESS",householdId,...(petId?{petId}:{})});
 beforeAll(async()=>{app=await createTestApp();db=app.get(PrismaService);});
 afterAll(async()=>{await app.close();});
 it("rejects a foreign household before writing onboarding progress",async()=>{
  const a=await actor(),b=await actor(),h=await hh(b);
  await send(a,"/onboarding/progress","put").send(progress(h.id)).expect(403);
  expect(await db.onboardingProgress.findUnique({where:{userId:a.id}})).toBeNull();
 });
 it("rejects another household pet even when the requested household is owned",async()=>{
  const a=await actor(),b=await actor(),own=await hh(a),foreign=await hh(b);
  const pet=(await send(b,`/households/${foreign.id}/pets`).send({name:"Other",species:"CAT"}).expect(201)).body;
  await send(a,"/onboarding/progress","put").send(progress(own.id,pet.id)).expect(403);
  expect(await db.onboardingProgress.findUnique({where:{userId:a.id}})).toBeNull();
 });
 it("keeps a sequential retry scoped to the actual household URL",async()=>{
  const a=await actor(),one=await hh(a),two=await hh(a),key=randomUUID();
  const first=(await send(a,`/households/${one.id}/pets`).set("Idempotency-Key",key).send({name:"کوکی",species:"CAT"}).expect(201)).body;
  const retry=(await send(a,`/households/${one.id}/pets`).set("Idempotency-Key",key).send({name:"کوکی",species:"CAT"}).expect(201)).body;
  expect(retry.id).toBe(first.id);
  const second=(await send(a,`/households/${two.id}/pets`).set("Idempotency-Key",key).send({name:"کوکی",species:"CAT"}).expect(201)).body;
  expect(second.householdId).toBe(two.id);expect(second.id).not.toBe(first.id);
  expect(await db.pet.count({where:{householdId:one.id}})).toBe(1);expect(await db.pet.count({where:{householdId:two.id}})).toBe(1);
 });
 it("preserves a pre-upgrade cached retry only for its original household",async()=>{
  const a=await actor(),one=await hh(a),two=await hh(a),key=randomUUID();
  const original=(await send(a,`/households/${one.id}/pets`).send({name:"Old cached pet",species:"CAT"}).expect(201)).body;
  await app.get<Redis>(REDIS_CLIENT).set(`idem:/households/:householdId/pets:${a.id}:${key}`,JSON.stringify(original),"EX",120);
  const retry=(await send(a,`/households/${one.id}/pets`).set("Idempotency-Key",key).send({name:"Old cached pet",species:"CAT"}).expect(201)).body;
  expect(retry.id).toBe(original.id);
  const other=(await send(a,`/households/${two.id}/pets`).set("Idempotency-Key",key).send({name:"Other household",species:"CAT"}).expect(201)).body;
  expect(other.householdId).toBe(two.id);expect(other.id).not.toBe(original.id);
  expect(await db.pet.count({where:{householdId:one.id}})).toBe(1);
 });
 it("accepts the creator's authorized pet and clears it when switching households",async()=>{
  const a=await actor(),one=await hh(a),two=await hh(a);
  const pet=(await send(a,`/households/${one.id}/pets`).send({name:"مجاز",species:"CAT"}).expect(201)).body;
  await send(a,"/onboarding/progress","put").send(progress(one.id,pet.id)).expect(200);
  const switched=(await send(a,"/onboarding/progress","put").send(progress(two.id)).expect(200)).body;
  expect(switched).toMatchObject({householdId:two.id,petId:null});
  const bad=await send(a,"/onboarding/progress","put").send(progress(two.id,pet.id));expect(bad.status).toBe(403);
  expect(await db.onboardingProgress.findUnique({where:{userId:a.id}})).toMatchObject({householdId:two.id,petId:null});
 });
 it("does not treat shared household membership as permission to edit another member's pet",async()=>{
  const owner=await actor(),member=await actor(),h=await hh(owner);
  await db.householdMember.create({data:{householdId:h.id,userId:member.id,role:"FAMILY"}});
  const pet=(await send(owner,`/households/${h.id}/pets`).send({name:"Owner only",species:"CAT"}).expect(201)).body;
  await send(member,"/onboarding/progress","put").send(progress(h.id,pet.id)).expect(403);
  expect(await db.onboardingProgress.findUnique({where:{userId:member.id}})).toBeNull();
 });
 it("does not promise deduplication when the caller omits an idempotency key",async()=>{
  const a=await actor(),h=await hh(a);
  const one=(await send(a,`/households/${h.id}/pets`).send({name:"بدون کلید",species:"CAT"}).expect(201)).body;
  const two=(await send(a,`/households/${h.id}/pets`).send({name:"بدون کلید",species:"CAT"}).expect(201)).body;
  expect(two.id).not.toBe(one.id);expect(await db.pet.count({where:{householdId:h.id}})).toBe(2);
 });
 it("keeps two authorized creators and their onboarding pet ids separate in one household",async()=>{
  const owner=await actor(),member=await actor(),h=await hh(owner),key=randomUUID();
  await db.householdMember.create({data:{householdId:h.id,userId:member.id,role:"FAMILY"}});
  await db.onboardingProgress.createMany({data:[owner,member].map(a=>({userId:a.id,householdId:h.id,chapter:"PET_IDENTITY",step:"age",status:"IN_PROGRESS"}))});
  const [one,two]=await Promise.all([
   send(owner,`/households/${h.id}/pets`).set("Idempotency-Key",key).send({name:"Owner pet",species:"CAT"}),
   send(member,`/households/${h.id}/pets`).set("Idempotency-Key",key).send({name:"Member pet",species:"CAT"})
  ]);
  expect(one.status).toBe(201);expect(two.status).toBe(201);expect(one.body.id).not.toBe(two.body.id);
  expect(await db.onboardingProgress.findUnique({where:{userId:owner.id}})).toMatchObject({petId:one.body.id});
  expect(await db.onboardingProgress.findUnique({where:{userId:member.id}})).toMatchObject({petId:two.body.id});
 });
 it("coalesces six concurrent same-key requests without opening duplicate pet transactions",async()=>{
  const a=await actor(),h=await hh(a),key=randomUUID();
  const responses=await Promise.all(Array.from({length:6},()=>send(a,`/households/${h.id}/pets`).set("Idempotency-Key",key).send({name:"همزمان",species:"CAT"})));
  const ids=new Set(responses.filter(r=>r.status===201).map(r=>r.body.id));const count=await db.pet.count({where:{householdId:h.id}});
  expect(responses.every(r=>r.status===201)).toBe(true);expect(count).toBe(ids.size);expect(count).toBe(1);expect(ids.size).toBe(1);
  console.info("QA_CONCURRENCY",JSON.stringify({requests:6,created:count,uniqueResponses:ids.size}));
 });
});
