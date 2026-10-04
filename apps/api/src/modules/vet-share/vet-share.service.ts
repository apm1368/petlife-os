import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { PetAccessDeniedException, NotFoundApiException, ValidationApiException } from "../../common/errors/api-exception";
import { PetAccessService } from "../pet-access/pet-access.service";
import { MedicalDocumentService } from "../clinical-health/medical-document.service";
import { ClinicalVisitService } from "../clinical-health/clinical-visit.service";
import type { VetShareDto } from "./vet-share.dto";
import { EntitlementService } from "../subscriptions/entitlement.service";

@Injectable()
export class VetShareService {
  constructor(private readonly prisma: PrismaService, private readonly access: PetAccessService, private readonly documents: MedicalDocumentService, private readonly visits: ClinicalVisitService, private readonly entitlements: EntitlementService) {}
  providers() {
    return this.prisma.providerUser.findMany({ where: { role: "VET", providerOrganization: { verificationStatus: "VERIFIED" } }, select: { id:true,displayTitle:true,providerOrganization:{select:{id:true,name:true}},user:{select:{displayName:true}} }, take: 100 });
  }
  private async assertManager(petId: string, userId: string) {
    const access=await this.access.getEffectivePermissions(petId,userId);
    if(!access?.canManageAccess || !access.canViewHealth) throw new PetAccessDeniedException();
  }
  private async validate(petId:string,dto:VetShareDto) {
    const provider=await this.prisma.providerUser.findFirst({where:{id:dto.providerUserId,role:"VET",providerOrganization:{verificationStatus:"VERIFIED"}}});
    if(!provider) throw new NotFoundApiException("Verified veterinarian");
    const startsAt=new Date(dto.startsAt), expiresAt=new Date(dto.expiresAt);
    if(!/(Z|[+-]\d{2}:\d{2})$/.test(dto.startsAt) || !/(Z|[+-]\d{2}:\d{2})$/.test(dto.expiresAt) || startsAt>=expiresAt || expiresAt<=new Date() || expiresAt.getTime()-startsAt.getTime()>90*86400000) throw new ValidationApiException({reason:"Choose a valid period, at most 90 days, with timezone."});
    if(dto.documentIds.length && !dto.scopes.includes("SELECTED_DOCUMENTS")) throw new ValidationApiException({field:"documentIds"});
    const count=await this.prisma.medicalDocument.count({where:{id:{in:dto.documentIds},petId,voidedAt:null}});
    if(count!==dto.documentIds.length) throw new NotFoundApiException("Selected document");
    return provider;
  }
  async preview(petId:string,userId:string,dto:VetShareDto) {
    await this.assertManager(petId,userId); await this.validate(petId,dto);
    return this.readScope(petId,dto.scopes,dto.documentIds);
  }
  async create(petId:string,userId:string,dto:VetShareDto) {
    await this.assertManager(petId,userId); const provider=await this.validate(petId,dto);
    // Sharing chosen records with a vet for a set time is a plan feature (vet.share); booking-time sharing stays free.
    const pet=await this.prisma.pet.findUniqueOrThrow({where:{id:petId},select:{householdId:true}});
    await this.entitlements.assertFeature(pet.householdId,"vet.share");
    return this.prisma.$transaction(async tx=>{
      const grant=await tx.petAccessGrant.create({data:{petId,userId:provider.userId,canViewIdentity:true,canViewHealth:false,canEditHealth:false,canRecordClinicalData:false,source:"TEMPORARY",reason:"EXPLICIT_VET_SHARE",startsAt:new Date(dto.startsAt),expiresAt:new Date(dto.expiresAt),grantedByUserId:userId,healthScopes:dto.scopes,selectedDocumentIds:dto.documentIds,sharedWithProviderUserId:provider.id}});
      await tx.domainEvent.create({data:{type:"PetHealthShared",aggregateType:"Pet",aggregateId:petId,payload:{petId,grantId:grant.id,actorUserId:userId,scopes:dto.scopes}}});
      return grant;
    });
  }
  async list(petId:string,userId:string) { await this.assertManager(petId,userId); return this.prisma.petAccessGrant.findMany({where:{petId,reason:"EXPLICIT_VET_SHARE"},orderBy:{createdAt:"desc"}}); }
  async revoke(petId:string,id:string,userId:string) {
    await this.assertManager(petId,userId);
    return this.prisma.$transaction(async tx=>{
      const result=await tx.petAccessGrant.updateMany({where:{id,petId,reason:"EXPLICIT_VET_SHARE",revokedAt:null},data:{revokedAt:new Date(),revokedByUserId:userId}});
      if(!result.count) throw new NotFoundApiException("Share");
      await tx.domainEvent.create({data:{type:"PetHealthShareRevoked",aggregateType:"Pet",aggregateId:petId,payload:{petId,grantId:id,actorUserId:userId}}});
      return {ok:true};
    });
  }
  private async active(petId:string,id:string,userId:string) {
    const now=new Date();
    const grant=await this.prisma.petAccessGrant.findFirst({where:{id,petId,userId,reason:"EXPLICIT_VET_SHARE",revokedAt:null,startsAt:{lte:now},expiresAt:{gt:now}}});
    if(!grant?.sharedWithProviderUserId) throw new PetAccessDeniedException();
    const provider=await this.prisma.providerUser.findFirst({where:{id:grant.sharedWithProviderUserId,userId,role:"VET",providerOrganization:{verificationStatus:"VERIFIED"}}});
    if(!provider) throw new PetAccessDeniedException();
    return grant;
  }
  /** Recipient inbox: only currently valid explicit shares addressed to this verified veterinarian. */
  async received(userId:string) {
    const now=new Date();
    const grants=await this.prisma.petAccessGrant.findMany({where:{userId,reason:"EXPLICIT_VET_SHARE",revokedAt:null,startsAt:{lte:now},expiresAt:{gt:now},sharedWithProviderUserId:{not:null}},orderBy:{expiresAt:"asc"},take:100,include:{pet:{select:{id:true,name:true,species:true}}}});
    const providerIds=new Set((await this.prisma.providerUser.findMany({where:{userId,role:"VET",providerOrganization:{verificationStatus:"VERIFIED"}},select:{id:true}})).map(p=>p.id));
    return grants.filter(g=>providerIds.has(g.sharedWithProviderUserId!)).map(g=>({id:g.id,pet:g.pet,scopes:g.healthScopes,documentCount:g.selectedDocumentIds.length,startsAt:g.startsAt,expiresAt:g.expiresAt}));
  }
  async read(petId:string,id:string,userId:string) { const grant=await this.active(petId,id,userId); return this.readScope(petId,grant.healthScopes,grant.selectedDocumentIds); }
  async download(petId:string,id:string,documentId:string,userId:string) {
    const grant=await this.active(petId,id,userId);
    if(!grant.healthScopes.includes("SELECTED_DOCUMENTS") || !grant.selectedDocumentIds.includes(documentId)) throw new PetAccessDeniedException();
    return this.documents.getDownload(petId,documentId);
  }
  private async readScope(petId:string,scopes:string[],documentIds:string[]) {
    const [conditions,allergies,medications,vaccination,documents,visits]=await Promise.all([
      scopes.includes("CONDITIONS")?this.prisma.condition.findMany({where:{petId}}):undefined,
      scopes.includes("ALLERGIES")?this.prisma.allergy.findMany({where:{petId}}):undefined,
      scopes.includes("CURRENT_MEDICATIONS")?this.prisma.medication.findMany({where:{petId,status:"ACTIVE"}}):undefined,
      scopes.includes("VACCINATION_SUMMARY")?this.prisma.vaccinationSummary.findUnique({where:{petId}}):undefined,
      scopes.includes("SELECTED_DOCUMENTS")?Promise.all(documentIds.map(id=>this.documents.getDto(petId,id))):undefined,
      scopes.includes("CLINICAL_HISTORY")?this.visits.list(petId):undefined,
    ]);
    return {petId,scopes,conditions,allergies,medications,vaccination,documents,visits};
  }
}
