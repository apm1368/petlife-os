import type { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { createTestApp, extractCookie } from "./test-app";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { signSessionCookie } from "../src/common/session/session-cookie.util";
import { grantPlanFeatures } from "./plan-features";
import { CareReminderWorker } from "../src/modules/care-reminders/care-reminder.worker";

describe("Batch 2 care and explicit veterinary sharing",()=>{
  let app:INestApplication,db:PrismaService,petId:string,otherPetId:string,owner:string,vet:string,providerId:string;
  const actors:Record<string,{id:string;cookie:string;csrf:string}>={};
  const rows:Record<string,string>={};
  beforeAll(async()=>{
    app=await createTestApp();db=app.get(PrismaService);
    for(const name of ["OWNER","AUTHORIZED_MEMBER","REVOKED_MEMBER","EXPIRED_GRANT","UNRELATED_HOUSEHOLD","VET"]){
      const user=await db.user.create({data:{displayName:name,email:`batch2-${randomUUID()}@example.com`}});
      const session=await db.session.create({data:{userId:user.id,expiresAt:new Date(Date.now()+86400000)}});
      const res=await request(app.getHttpServer()).get("/health/live");
      const csrf=extractCookie(res.headers["set-cookie"],"petlife_csrf")!;
      actors[name]={id:user.id,csrf,cookie:`petlife_session=${signSessionCookie(session.id,process.env.SESSION_SECRET!)}; petlife_csrf=${csrf}`};
    }
    owner=actors.OWNER!.id;vet=actors.VET!.id;
    const household=await db.household.create({data:{name:"خانواده آزمون"}});
    await grantPlanFeatures(db,household.id,["care.reminders","vet.share"]);
    const other=await db.household.create({data:{name:"خانواده مستقل"}});
    const pet=await db.pet.create({data:{householdId:household.id,name:"کوکی",species:"DOG"}});petId=pet.id;
    otherPetId=(await db.pet.create({data:{householdId:other.id,name:"پت مستقل",species:"CAT"}})).id;
    for(const name of ["OWNER","AUTHORIZED_MEMBER","REVOKED_MEMBER","EXPIRED_GRANT"]){await db.petAccessGrant.create({data:{petId,userId:actors[name]!.id,canViewHealth:true,canViewCareProfile:true,canEditCareProfile:name==="OWNER",canManageAccess:name==="OWNER",revokedAt:name==="REVOKED_MEMBER"?new Date():null,expiresAt:name==="EXPIRED_GRANT"?new Date(Date.now()-1000):null}});}
    const org=await db.providerOrganization.create({data:{name:"کلینیک آزمون",type:"VET_CLINIC",verificationStatus:"VERIFIED"}});
    providerId=(await db.providerUser.create({data:{userId:vet,providerOrganizationId:org.id,role:"VET"}})).id;
    rows.condition=(await db.condition.create({data:{petId:otherPetId,name:"foreign"}})).id;
    rows.allergy=(await db.allergy.create({data:{petId:otherPetId,name:"foreign"}})).id;
    rows.medication=(await db.medication.create({data:{petId:otherPetId,name:"foreign"}})).id;
    rows.lab=(await db.labResult.create({data:{petId:otherPetId,testName:"CBC"}})).id;
    rows.imaging=(await db.imagingStudy.create({data:{petId:otherPetId,studyType:"XRAY"}})).id;
    rows.dental=(await db.dentalRecord.create({data:{petId:otherPetId,recordType:"EXAM"}})).id;
    rows.nutrition=(await db.clinicalNutritionPlan.create({data:{petId:otherPetId,providerOrganizationId:org.id}})).id;
    rows.rehab=(await db.rehabPlan.create({data:{petId:otherPetId,providerOrganizationId:org.id}})).id;
    rows.referral=(await db.referral.create({data:{petId:otherPetId,fromProviderOrganizationId:org.id,reason:"foreign"}})).id;
    rows.visit=(await db.clinicalVisit.create({data:{petId:otherPetId,householdId:other.id,providerOrganizationId:org.id,providerUserId:providerId}})).id;
    rows.document=(await db.medicalDocument.create({data:{petId:otherPetId,householdId:other.id,documentType:"OTHER",title:"foreign",sourceType:"OWNER",fileObjectKey:`health-documents/${otherPetId}/test.pdf`,mimeType:"application/pdf",fileSizeBytes:12}})).id;
    rows.care=(await db.careReminder.create({data:{petId:otherPetId,createdByUserId:owner,title:"foreign",type:"CUSTOM",dueAt:new Date(),originalDueAt:new Date()}})).id;
    await db.condition.create({data:{petId,name:"آلرژی پوستی ثبت‌شده"}});
  });
  afterAll(async()=>{await app?.close();});
  const get=(actor:string,url:string)=>request(app.getHttpServer()).get(url).set("Cookie",actors[actor]!.cookie);
  const post=(actor:string,url:string)=>request(app.getHttpServer()).post(url).set("Cookie",actors[actor]!.cookie).set("x-csrf-token",actors[actor]!.csrf);
  const routes=["health/conditions","health/allergies","health/medications","health/vaccination-summary","health/labs","health/imaging","health/referrals","health/dental","health/nutrition","health/rehab","health/documents","health/visits","observations","care-items"];
  it.each(routes)("enforces all actor classes at %s",async route=>{
    for(const actor of ["OWNER","AUTHORIZED_MEMBER"])await get(actor,`/pets/${petId}/${route}`).expect(200);
    for(const actor of ["REVOKED_MEMBER","EXPIRED_GRANT","UNRELATED_HOUSEHOLD"])await get(actor,`/pets/${petId}/${route}`).expect(403);
    await request(app.getHttpServer()).get(`/pets/${petId}/${route}`).expect(401);
    await get("OWNER",`/pets/${otherPetId}/${route}`).expect(403);
  });
  it.each([["condition","health/conditions"],["allergy","health/allergies"],["medication","health/medications"],["lab","health/labs"],["imaging","health/imaging"],["referral","health/referrals"],["dental","health/dental"],["nutrition","health/nutrition"],["rehab","health/rehab"],["document","health/documents"],["visit","health/visits"],["care","care-items"]])("rejects a genuine foreign %s identifier",async(key,route)=>{await get("OWNER",`/pets/${petId}/${route}/${rows[key!]}`).expect(404);});
  it("denies forged document download",async()=>{await get("OWNER",`/pets/${petId}/health/documents/${rows.document}/download`).expect(404);});
  it("performs snooze/reschedule/complete with audit and one recurring successor",async()=>{
    const due=new Date(Date.now()-3600000).toISOString();
    const created=await post("OWNER",`/pets/${petId}/care-items`).send({title:"کنترل وزن",type:"WEIGHT_CHECK",dueAt:due,recurrence:"WEEKLY"}).expect(201);
    const id=created.body.id;
    await post("AUTHORIZED_MEMBER",`/pets/${petId}/care-items/${id}/actions`).send({action:"COMPLETE"}).expect(403);
    const snoozed=await post("OWNER",`/pets/${petId}/care-items/${id}/actions`).send({action:"SNOOZE",at:new Date(Date.now()+7200000).toISOString()}).expect(201);
    // The action's response carries the state the member sees, same as list/get (regression: it returned the stored state).
    expect(snoozed.body.state).toBe("SNOOZED");
    let row=await db.careReminder.findUniqueOrThrow({where:{id}});expect(row.dueAt.toISOString()).toBe(due);
    await post("OWNER",`/pets/${petId}/care-items/${id}/actions`).send({action:"RESCHEDULE",at:new Date(Date.now()+86400000).toISOString()}).expect(201);
    await post("OWNER",`/pets/${petId}/care-items/${id}/actions`).send({action:"COMPLETE"}).expect(201);
    await post("OWNER",`/pets/${petId}/care-items/${id}/actions`).send({action:"COMPLETE"}).expect(400);
    row=await db.careReminder.findUniqueOrThrow({where:{id}});expect(row.originalDueAt.toISOString()).toBe(due);expect(row.state).toBe("COMPLETED");
    expect(await db.careReminder.count({where:{parentId:id}})).toBe(1);
    expect(await db.domainEvent.count({where:{type:"CareReminderCompleted",aggregateId:petId}})).toBeGreaterThan(0);
    expect(await db.clinicalVisit.count({where:{petId}})).toBe(0);
  });
  it("shares only chosen scope and enforces revoke, expiry, provider and forged document",async()=>{
    const input={providerUserId:providerId,scopes:["CONDITIONS"],documentIds:[],startsAt:new Date(Date.now()-1000).toISOString(),expiresAt:new Date(Date.now()+86400000).toISOString()};
    await post("OWNER",`/pets/${petId}/vet-shares/preview`).send(input).expect(201);
    const created=await post("OWNER",`/pets/${petId}/vet-shares`).send(input).expect(201);
    const url=`/shared-pets/${petId}/vet-shares/${created.body.id}`;
    const shared=await get("VET",url).expect(200);expect(shared.body.conditions).toHaveLength(1);expect(shared.body.medications).toBeUndefined();expect(shared.body.documents).toBeUndefined();
    await get("VET",`/pets/${petId}/health/conditions`).expect(403);
    await get("UNRELATED_HOUSEHOLD",url).expect(403);
    await get("VET",`${url}/documents/${rows.document}/download`).expect(403);
    await post("OWNER",`/pets/${petId}/vet-shares/${created.body.id}/revoke`).send({}).expect(201);
    await get("VET",url).expect(403);
    const expired=await post("OWNER",`/pets/${petId}/vet-shares`).send(input).expect(201);
    await db.petAccessGrant.update({where:{id:expired.body.id},data:{expiresAt:new Date(Date.now()-1)}});
    await get("VET",`/shared-pets/${petId}/vet-shares/${expired.body.id}`).expect(403);
  });
  it("does not honor full-health permission on legacy booking grants",async()=>{
    await db.petAccessGrant.create({data:{petId,userId:vet,canViewHealth:true,canRecordClinicalData:true,source:"TEMPORARY",reason:"VET_BOOKING"}});
    await get("VET",`/pets/${petId}/health/conditions`).expect(403);
  });
  it("sends a deduplicated exact care-item notification through H10",async()=>{
    const item=await db.careReminder.create({data:{petId,createdByUserId:owner,title:"یادآور دارو",type:"MEDICATION",originalDueAt:new Date(Date.now()-10000),dueAt:new Date(Date.now()-10000)}});
    const worker=app.get(CareReminderWorker);await worker.process();await worker.process();
    const notifications=await db.notification.findMany({where:{entityId:item.id,userId:owner}});
    expect(notifications).toHaveLength(1);expect(notifications[0]!.deepLink).toBe(`/pets/${petId}/care/${item.id}`);
  });
});
