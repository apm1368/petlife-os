import { PrismaClient } from "@prisma/client";
import { mkdir, copyFile, stat } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { createHash } from "node:crypto";
const db=new PrismaClient();
const id=(key:string)=>{const h=createHash("sha256").update(`petlife-batch2-qa:${key}`).digest("hex").slice(0,32);return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20)}`;};
async function main(){
  const database=new URL(process.env.DATABASE_URL??"").pathname;
  // Staging review data is opt-in: a non-test database must be named explicitly so this never runs by accident.
  if(!database.endsWith("_test")&&process.env.PETLIFE_QA_SEED_DATABASE!==database.slice(1))throw new Error("This QA seed runs against a *_test database, or a staging database named in PETLIFE_QA_SEED_DATABASE.");
  const householdId=id("household"),org=id("clinic"),staff=id("staff"),location=id("location"),service=id("service");
  // Email is the stable identity for review accounts, so reruns reuse them even if id derivation changes.
  const ownerId=(await db.user.upsert({where:{email:"batch2-review@example.test"},create:{id:id("owner"),email:"batch2-review@example.test",displayName:"مریم رضایی (حساب نمایشی)",locale:"fa"},update:{}})).id;
  const vet=(await db.user.upsert({where:{email:"batch2-vet@example.test"},create:{id:id("vet"),email:"batch2-vet@example.test",displayName:"دکتر سارا احمدی (حساب نمایشی)",locale:"fa"},update:{}})).id;
  await db.household.upsert({where:{id:householdId},create:{id:householdId,name:"خانواده رضایی (نمایشی)",countryCode:"IR",city:"تهران"},update:{}});
  await db.householdMember.upsert({where:{householdId_userId:{householdId,userId:ownerId}},create:{householdId,userId:ownerId,role:"OWNER"},update:{}});
  await db.providerOrganization.upsert({where:{id:org},create:{id:org,name:"درمانگاه دامپزشکی مهر (نمایشی)",type:"VET_CLINIC",verificationStatus:"VERIFIED"},update:{}});
  await db.providerUser.upsert({where:{id:staff},create:{id:staff,userId:vet,providerOrganizationId:org,role:"VET"},update:{}});
  await db.providerLocation.upsert({where:{id:location},create:{id:location,providerOrganizationId:org,name:"شعبه ونک",addressLine:"تهران، ونک، خیابان ملاصدرا",city:"تهران",countryCode:"IR",timezone:"Asia/Tehran"},update:{}});
  await db.providerService.upsert({where:{id:service},create:{id:service,providerOrganizationId:org,locationId:location,name:"ویزیت پیگیری",type:"GENERAL_VET_VISIT",category:"VET",durationMinutes:30,currency:"IRR",priceAmount:0},update:{}});
  const scenarios=[{key:"young",name:"پشمک",species:"DOG" as const,age:18},{key:"cat",name:"لونا",species:"CAT" as const,age:36},{key:"senior",name:"بامبو",species:"DOG" as const,age:132},{key:"overdue",name:"فندق",species:"DOG" as const,age:48},{key:"memorial",name:"برفی",species:"CAT" as const,age:180},{key:"showcase",name:"کوکی",species:"DOG" as const,age:42}];
  const due=new Date(Date.now()+7*86400000),past=new Date(Date.now()-7*86400000);
  for(const s of scenarios){const petId=id(s.key);
    await db.pet.upsert({where:{id:petId},create:{id:petId,householdId,name:s.name,species:s.species,approximateAgeMonths:s.age,lifecycleStatus:s.key==="memorial"?"MEMORIAL":"ACTIVE",photoUrl:s.key==="showcase"?"/images/landing/cookie-reference.jpg":null},update:{}});
    await db.petAccessGrant.upsert({where:{id:id(`${s.key}-access`)},create:{id:id(`${s.key}-access`),petId,userId:ownerId,canViewIdentity:true,canEditIdentity:true,canViewHealth:true,canEditHealth:true,canBookCare:true,canViewCareProfile:true,canEditCareProfile:true,canManageAccess:true},update:{}});
    if(s.key==="young"||s.key==="showcase")await db.vaccinationSummary.upsert({where:{petId},create:{petId,status:"DUE_SOON",nextDueDate:due,notes:"نوبت بعدی طبق کارت واکسن ثبت‌شده توسط درمانگاه."},update:{}});
    if(s.key==="cat"||s.key==="showcase"){
      await db.allergy.upsert({where:{id:id(`${s.key}-allergy`)},create:{id:id(`${s.key}-allergy`),petId,name:"حساسیت به پروتئین مرغ",reaction:"خارش و قرمزی پوست پس از غذای حاوی مرغ",severity:"MODERATE",sourceType:"OWNER",recordedByUserId:ownerId},update:{}});
      await db.medication.upsert({where:{id:id(`${s.key}-med`)},create:{id:id(`${s.key}-med`),petId,name:"Apoquel (oclacitinib)",dosage:16,unit:"mg",frequencyText:"روزی یک‌بار همراه غذا",route:"خوراکی",status:"ACTIVE",startDate:past,instructions:"طبق نسخه دامپزشک ادامه داده شود.",sourceType:"PROVIDER"},update:{}});
    }
    if(["senior","showcase"].includes(s.key)){
      await db.labResult.upsert({where:{id:id(`${s.key}-lab`)},create:{id:id(`${s.key}-lab`),petId,testName:"هماتوکریت (HCT)",testCode:"HCT",sampleDate:past,resultDate:past,value:"45",unit:"%",referenceRangeLow:37,referenceRangeHigh:55,providerOrganizationId:org,recordedByProviderUserId:staff,status:"FINAL",notes:"نمونه خون ناشتا"},update:{}});
      await db.imagingStudy.upsert({where:{id:id(`${s.key}-imaging`)},create:{id:id(`${s.key}-imaging`),petId,studyType:"XRAY",providerOrganizationId:org,performedByProviderUserId:staff,bodyRegion:"مفصل ران",report:"رادیوگرافی دو نمای لگن؛ گزارش کامل توسط رادیولوژیست درمانگاه ثبت شده است."},update:{}});
    }
    if(["memorial","showcase"].includes(s.key))await db.clinicalVisit.upsert({where:{id:id(`${s.key}-visit`)},create:{id:id(`${s.key}-visit`),petId,householdId,providerOrganizationId:org,providerUserId:staff,status:"COMPLETED",startedAt:past,completedAt:past,reasonForVisit:s.key==="memorial"?"معاینه دوره‌ای سالمندی":"معاینه پوست و پیگیری خارش",historyText:"صاحب حیوان از خارش متناوب در دو هفته اخیر گزارش داده است."},update:{}});
    if(s.key!=="memorial")await db.careReminder.upsert({where:{id:id(`${s.key}-reminder`)},create:{id:id(`${s.key}-reminder`),petId,createdByUserId:ownerId,title:s.key==="overdue"?"قرص ضدانگل ماهانه":s.key==="young"?"یادآور واکسن سالانه":s.key==="cat"?"تهیه مجدد دارو":s.key==="senior"?"پیگیری نتیجه آزمایش":"پیگیری پوست با دامپزشک",type:s.key==="overdue"?"PARASITE_PREVENTION":s.key==="young"?"VACCINATION":s.key==="cat"?"MEDICATION_REFILL":"FOLLOW_UP",dueAt:s.key==="overdue"?past:due,originalDueAt:s.key==="overdue"?past:due},update:{}});
    if(["overdue","showcase"].includes(s.key)){
      const startAt=new Date(due.getTime()+(s.key==="showcase"?86400000:0)); const bookingId=id(`${s.key}-booking`),endAt=new Date(startAt.getTime()+1800000);
      await db.booking.upsert({where:{id:bookingId},create:{id:bookingId,petId,householdId,userId:ownerId,providerOrganizationId:org,providerLocationId:location,providerServiceId:service,providerUserId:staff,category:"VET",locationMode:"AT_PROVIDER",startAt,endAt,timezone:"Asia/Tehran"},update:{}});
      await db.careCalendarEvent.upsert({where:{sourceType_sourceId:{sourceType:"VET_APPOINTMENT",sourceId:bookingId}},create:{petId,householdId,sourceType:"VET_APPOINTMENT",sourceId:bookingId,type:"VET_APPOINTMENT",startAt,endAt,timezone:"Asia/Tehran",titleKey:"careCalendar.event.vetAppointment"},update:{}});
    }
  }
  const petId=id("showcase");
  await db.condition.upsert({where:{id:id("showcase-condition")},create:{id:id("showcase-condition"),petId,name:"درماتیت آتوپیک",status:"ACTIVE",sourceType:"PROVIDER",sourceLabel:"کلینیک نمایشی مهر"},update:{}});
  await db.careReminder.upsert({where:{id:id("showcase-completed")},create:{id:id("showcase-completed"),petId,createdByUserId:ownerId,title:"کنترل وزن انجام‌شده",type:"WEIGHT_CHECK",dueAt:past,originalDueAt:past,state:"COMPLETED",completedAt:past},update:{}});
  await db.petMemory.upsert({where:{id:id("showcase-memory")},create:{id:id("showcase-memory"),petId,householdId,createdByUserId:ownerId,type:"STORY",title:"اولین قدم‌زدن در پارک",description:"کوکی برای اولین بار بدون ترس از صدای دوچرخه‌ها کنار ما راه رفت.",occurredAt:past},update:{}});
  await db.referral.upsert({where:{id:id("showcase-referral")},create:{id:id("showcase-referral"),petId,fromProviderOrganizationId:org,fromProviderUserId:staff,externalProviderName:"مرکز تخصصی پوست دام پارس",externalSpecialty:"پوست",reason:"ارزیابی تخصصی درماتیت و تست حساسیت",status:"SENT",clinicalVisitId:id("showcase-visit")},update:{}});
  const fileObjectKey=`health-documents/${petId}/qa-owned-photo.jpg`;
  const source=resolve(__dirname,"../../web/public/images/landing/cookie-reference.jpg");
  const destination=resolve(process.env.STORAGE_LOCAL_DIR??"./local-storage",fileObjectKey);
  await mkdir(dirname(destination),{recursive:true});await copyFile(source,destination);
  await db.medicalDocument.upsert({where:{id:id("showcase-document")},create:{id:id("showcase-document"),petId,householdId,title:"عکس ضایعه پوستی — پیوست ویزیت",documentType:"OTHER",sourceType:"OWNER",sourceUserId:ownerId,fileObjectKey,mimeType:"image/jpeg",fileSizeBytes:(await stat(source)).size},update:{}});
  console.log(JSON.stringify({householdId,ownerId,showcasePetId:petId,scenarios:scenarios.map(s=>({name:s.name,petId:id(s.key)}))},null,2));
}
main().finally(()=>db.$disconnect());
