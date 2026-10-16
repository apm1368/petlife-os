from pathlib import Path
exec((Path(__file__).parent/'browser-fixtures.py').read_text())
base=mock
provider={'providerUserId':'pu1','providerOrganizationId':'org1','organizationName':'کلینیک همراه','organizationType':'VET_CLINIC','verificationStatus':'SUBMITTED','role':'OWNER'}
seller={'sellerMembershipId':'sm1','sellerOrganizationId':'seller1','organizationName':'فروشگاه همراه','verificationStatus':'NEEDS_INFORMATION','role':'OWNER','sellerStatus':'ACTIVE'}
document={'id':'doc1','kind':'LICENSE','status':'PENDING','mimeType':'application/pdf','fileSizeBytes':1024,'expiresAt':None,'expiryState':'NO_EXPIRY','reviewNote':None,'rejectionReason':None,'submittedAt':'2026-10-15T10:00:00Z','createdAt':'2026-10-15T10:00:00Z','reviewedAt':None,'reviewedByAdminId':None}
policy={'version':'2026-10-15.1','mode':'MANUAL_DOCUMENT_REVIEW','officialLookup':'NOT_CONNECTED','requiredDocumentKinds':['IDENTITY','LICENSE'],'missingForSubmission':['IDENTITY'],'missingForApproval':['IDENTITY','LICENSE']}
state={'policy':policy,'status':'SUBMITTED','lifecycle':'PENDING','submittedAt':'2026-10-15T10:00:00Z','note':None,'canSubmit':False,'documents':[document]}
detail={**state,'subjectType':'PROVIDER','id':'org1','name':'کلینیک همراه','kind':'VET_CLINIC','allowedTransitions':['UNDER_REVIEW','NEEDS_INFORMATION','REJECTED','VERIFIED']}
def fixture(r):
 path=urlparse(r.request.url).path
 if path=='/admin/me':data={'isAdmin':True,'adminUserId':'admin1','displayName':'پدرام','role':'VERIFICATION','permissions':['verification.manage']}
 elif path=='/admin/verification/queue':data=[{'subjectType':'PROVIDER','id':'org1','name':'کلینیک همراه','kind':'VET_CLINIC','status':'SUBMITTED','submittedAt':state['submittedAt'],'waitingHours':12,'documents':{'pending':1,'accepted':0,'rejected':0,'expired':0}}]
 elif path=='/admin/verification/PROVIDER/org1':data=detail
 elif path=='/provider/me/context':data={'active':provider,'memberships':[provider]}
 elif path=='/provider/verification':data=state
 elif path=='/seller-context':data={'active':seller,'memberships':[seller]}
 elif path=='/seller-organizations/seller1/verification':data={**state,'status':'NEEDS_INFORMATION','lifecycle':'RESUBMISSION_REQUESTED','canSubmit':True,'note':'لطفاً تصویر خوانای مجوز فعالیت را ارسال کنید.'}
 else:return base(r)
 r.fulfill(status=200,content_type='application/json',body=json.dumps(data))
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox']);results=[]
 for lang,width in [('fa',390),('fa',1440),('en',390),('en',1440)]:
  page=b.new_page(viewport={'width':width,'height':900},reduced_motion='reduce');errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.route('http://localhost:4000/**',fixture)
  for key,route,fa,en in [('kyc-queue','admin/verification','صف احراز هویت همکاران','Partner verification queue'),('kyc-review','admin/verification/provider/org1','کلینیک همراه','کلینیک همراه'),('kyc-provider','provider/verification','احراز هویت و مدارک مجموعه','Organization verification and documents'),('kyc-seller','seller/verification','احراز هویت و مدارک مجموعه','Organization verification and documents')]:
   errors.clear();page.goto(f'http://127.0.0.1:3000/{lang}/{route}',wait_until='networkidle',timeout=120000);expect(page.get_by_role('heading',name=fa if lang=='fa' else en,exact=True).first).to_be_visible(timeout=30000)
   page.evaluate('document.fonts.ready');page.screenshot(path='/tmp/kyc-review.png',full_page=True);Image.open('/tmp/kyc-review.png').save(out/f'{key}-{lang}-{width}.webp',quality=85)
   result={'page':key,'locale':lang,'width':width,'overflow':page.evaluate('document.documentElement.scrollWidth>innerWidth'),'pageErrors':errors.copy()};results.append(result);print(json.dumps(result),flush=True);(out/'kyc-browser-checks.json').write_text(json.dumps(results,indent=2));assert not result['overflow'] and not errors,result
  page.close()
 b.close()
