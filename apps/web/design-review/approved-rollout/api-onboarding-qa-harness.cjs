const fs=require('fs');const path=require('path');const crypto=require('crypto');
const root=process.env.QA_REPO_ROOT;
const dbUrl=new URL(process.env.DATABASE_URL);if(dbUrl.hostname!=='127.0.0.1'||!dbUrl.pathname.endsWith('_test'))throw Error('Only isolated loopback test DB');
const privateFixtures=require('path').resolve(process.env.QA_FIXTURES_FILE);if(!privateFixtures.startsWith('/tmp/')||privateFixtures.startsWith(require('path').resolve(root)+'/'))throw Error('Fixture file must be outside repo under /tmp');
require(root+'/apps/api/test/jest-env-setup.js');
const {extractCookie}=require(root+'/apps/api/test/test-app.ts');
const {Test}=require(root+'/apps/api/node_modules/@nestjs/testing');
const {ValidationPipe}=require(root+'/apps/api/node_modules/@nestjs/common');
const cookieParser=require(root+'/apps/api/node_modules/cookie-parser');
const {AppModule}=require(root+'/apps/api/src/app.module.ts');
const {ApiExceptionFilter}=require(root+'/apps/api/src/common/filters/api-exception.filter.ts');
const {PrismaService}=require(root+'/apps/api/src/common/prisma/prisma.service.ts');
const {signSessionCookie}=require(root+'/apps/api/src/common/session/session-cookie.util.ts');
const request=require(root+'/apps/api/node_modules/supertest');
(async()=>{
 const moduleRef=await Test.createTestingModule({imports:[AppModule]}).compile();
 const app=moduleRef.createNestApplication();app.use(cookieParser());app.useGlobalFilters(new ApiExceptionFilter());app.useGlobalPipes(new ValidationPipe({whitelist:true,transform:true,forbidNonWhitelisted:true}));
 app.enableCors({origin:'http://127.0.0.1:3020',credentials:true});await app.listen(4141,'127.0.0.1');
 const db=app.get(PrismaService);const fixtures=[];
 for(const locale of ['fa','en'])for(const width of [390,1440])for(const fault of (process.env.QA_FAULTS||'lost-response,progress-failure,cached-response-edit,draft-family-switch').split(',')){
  const user=await db.user.create({data:{displayName:'QA isolated',email:`browser-${crypto.randomUUID()}@example.com`,locale}});
  const h=await db.household.create({data:{name:'QA isolated',members:{create:{userId:user.id,role:'OWNER'}}}});
  await db.onboardingProgress.create({data:{userId:user.id,householdId:h.id,chapter:'PET_IDENTITY',step:'age',status:'IN_PROGRESS'}});
  const session=await db.session.create({data:{userId:user.id,expiresAt:new Date(Date.now()+3600000)}});
  const res=await request(app.getHttpServer()).get('/health/live');const csrf=extractCookie(res.headers['set-cookie'],'petlife_csrf');
  fixtures.push({locale,width,fault,householdId:h.id,session:signSessionCookie(session.id,process.env.SESSION_SECRET),csrf});
 }
 fs.writeFileSync(privateFixtures,JSON.stringify(fixtures),{mode:0o600});console.log('QA_SERVER_READY');
 process.on('SIGTERM',async()=>{await app.close();process.exit(0);});
})().catch(e=>{console.error('QA_HARNESS_ERROR',e.name);process.exit(1);});
