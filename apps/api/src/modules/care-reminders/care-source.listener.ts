import { Injectable, Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { createHash } from "node:crypto";
import { PrismaService } from "../../common/prisma/prisma.service";

/** Project only dates that were actually recorded. The source rows are never edited by reminder actions. */
@Injectable()
export class CareSourceListener {
  private readonly logger=new Logger(CareSourceListener.name);
  constructor(private readonly prisma:PrismaService){}
  @OnEvent("VaccinationSummaryUpdated")
  @OnEvent("CarePlanCreated")
  @OnEvent("CarePlanUpdated")
  async onSource(payload:{petId?:string}) {if(!payload.petId)return;try{await this.syncPet(payload.petId);}catch(e){this.logger.error("Care source projection failed",e);}}
  async syncPet(petId:string) {
    const pet=await this.prisma.pet.findUnique({where:{id:petId}});if(!pet)return;
    const owner=await this.prisma.householdMember.findFirst({where:{householdId:pet.householdId,role:"OWNER"},orderBy:{createdAt:"asc"}});if(!owner)return;
    const [vaccination,items]=await Promise.all([this.prisma.vaccinationSummary.findUnique({where:{petId}}),this.prisma.carePlanItem.findMany({where:{carePlan:{petId},dueAt:{not:null},status:{in:["ACTIVE","PENDING"]}}})]);
    const projected:{sourceId:string;source:string;type:string;title:string;dueAt:Date}[]=[];
    if(vaccination?.nextDueDate)projected.push({sourceId:petId,source:"MEDICAL_RECORD_DERIVED",type:"VACCINATION",title:"واکسن / Vaccination",dueAt:vaccination.nextDueDate});
    for(const item of items)if(item.dueAt)projected.push({sourceId:item.id,source:"PROVIDER_CREATED",type:["MEDICATION","FOLLOW_UP","VACCINATION"].includes(item.type)?item.type:"CUSTOM",title:item.title,dueAt:item.dueAt});
    for(const source of projected){
      await this.prisma.careReminder.updateMany({where:{petId,source:source.source,sourceId:source.sourceId,originalDueAt:{not:source.dueAt},state:{notIn:["COMPLETED","CANCELLED"]}},data:{state:"CANCELLED",cancelledAt:new Date(),version:{increment:1}}});
      const hex=createHash("sha256").update(`care-source:${petId}:${source.source}:${source.sourceId}:${source.dueAt.toISOString()}`).digest("hex").slice(0,32);
      const id=`${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-8${hex.slice(17,20)}-${hex.slice(20)}`;
      // Rows projected before the UUID version fix have a different id; match on source identity so they are not duplicated.
      if(await this.prisma.careReminder.count({where:{petId,source:source.source,sourceId:source.sourceId,originalDueAt:source.dueAt,parentId:null}}))continue;
      await this.prisma.careReminder.upsert({where:{id},create:{id,petId,createdByUserId:owner.userId,...source,originalDueAt:source.dueAt},update:{}});
    }
    return projected.length;
  }
}
