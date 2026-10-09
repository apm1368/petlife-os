import { Injectable, Logger, type OnModuleInit, type OnModuleDestroy } from "@nestjs/common";
import { createHash } from "node:crypto";
import { PrismaService } from "../../common/prisma/prisma.service";
import { PetAccessService } from "../pet-access/pet-access.service";
import { NotificationOrchestratorService } from "../notifications/notification-orchestrator.service";
import { CareSourceListener } from "./care-source.listener";
@Injectable()
export class CareReminderWorker implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private sourceCursor: string | undefined;
  private readonly logger = new Logger(CareReminderWorker.name);
  constructor(private readonly prisma:PrismaService,private readonly access:PetAccessService,private readonly notifications:NotificationOrchestratorService,private readonly sources:CareSourceListener){}
  onModuleInit() { if(process.env.NODE_ENV!=="test") this.timer=setInterval(()=>{void this.process().catch(e=>this.logger.error("Care notification tick failed",e));},60000); }
  onModuleDestroy() {if(this.timer) clearInterval(this.timer);}
  async process() {
    if(this.running) return 0;
    this.running=true;
    try {
      const pets=await this.prisma.pet.findMany({where:this.sourceCursor?{id:{gt:this.sourceCursor}}:undefined,select:{id:true},orderBy:{id:"asc"},take:25});
      for(const pet of pets)await this.sources.syncPet(pet.id);
      this.sourceCursor=pets.length===25?pets[pets.length-1]?.id:undefined;
      const now=new Date();
      const rows=await this.prisma.careReminder.findMany({where:{state:{notIn:["COMPLETED","CANCELLED"]},dueAt:{lte:new Date(now.getTime()+86400000)},AND:[{OR:[{notifiedAt:null},{dueAt:{lte:now},notifiedAt:{lt:this.prisma.careReminder.fields.dueAt}}]},{OR:[{snoozedUntil:null},{snoozedUntil:{lte:now}}]}]},include:{pet:{select:{name:true,householdId:true}}},take:100,orderBy:{dueAt:"asc"}});
      let count=0;
      for(const row of rows) {
        const access=await this.access.getEffectivePermissions(row.petId,row.createdByUserId);
        if(!access?.canViewCareProfile) continue;
        if(row.source !== "USER_CREATED" && !access.canViewHealth) continue;
        // Stable event identity makes concurrent workers/retries use H10's notification deduplication.
        const phase=row.dueAt<=now?"OVERDUE":"DUE";
        const hex=createHash("sha256").update(`care:${row.id}:${row.version}:${phase}`).digest("hex").slice(0,32);
        const id=`${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-8${hex.slice(17,20)}-${hex.slice(20)}`;
        await this.prisma.domainEvent.upsert({where:{id},create:{id,type:"CareReminderDue",aggregateType:"Pet",aggregateId:row.petId,payload:{petId:row.petId,careItemId:row.id,type:row.type,dueAt:row.dueAt.toISOString()}},update:{}});
        const stillOpen=await this.prisma.careReminder.count({where:{id:row.id,version:row.version,state:{notIn:["COMPLETED","CANCELLED"]}}});
        if(!stillOpen) continue;
        await this.notifications.notify({userId:row.createdByUserId,type:"health.reminder",category:"HEALTH",petId:row.petId,householdId:row.pet.householdId,deepLink:`/pets/${row.petId}/care/${row.id}`,entityType:"CareReminder",entityId:row.id,domainEventId:id,templateParams:{petName:row.pet.name},metadata:{careType:row.type,phase,dueAt:row.dueAt.toISOString()}});
        await this.prisma.careReminder.updateMany({where:{id:row.id,version:row.version},data:{notifiedAt:now}});
        count++;
      }
      return count;
    } finally {this.running=false;}
  }
}
