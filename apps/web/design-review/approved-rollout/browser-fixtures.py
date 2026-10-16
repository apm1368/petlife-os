# Controlled browser review data only. Never imported by the application.
import json,sys,subprocess
from pathlib import Path
from urllib.parse import urlparse,parse_qs
from playwright.sync_api import sync_playwright,expect
from PIL import Image
root=Path(__file__).resolve().parents[4];out=root/'apps/web/design-review/shop-design';before='--before' in sys.argv
pet={'id':'pet-1','householdId':'h1','name':'کوکی','species':'DOG','breed':'میکس','birthDate':None,'approximateAgeMonths':36,'photoUrl':'/images/landing/home/cookie.webp','lifecycleStatus':'ACTIVE','sex':'FEMALE','latestWeightValue':'8.5','microchipNumber':None,'status':'ACTIVE'}
user={'id':'u1','displayName':'پدرام','avatarUrl':None,'locale':'fa','theme':'LIGHT','onboardingStatus':'COMPLETED','accountState':'READY'}
access={k:True for k in ['canViewIdentity','canEditIdentity','canViewHealth','canEditHealth','canBookCare','canViewCareProfile','canEditCareProfile','canViewLocation','canManageAccess','canRecordClinicalData']}
CATS=[{'id':f'cat-{i}','parentId':None,'name':name,'slug':slug,'status':'ACTIVE'} for i,(name,slug) in enumerate([('غذا و تشویقی','food'),('سلامت و مراقبت','health'),('اسباب‌بازی','toys'),('لوازم و وسایل','accessories')])]
SELLER={'id':'seller-1','name':'فروشگاه همراه','verificationStatus':'VERIFIED','status':'ACTIVE','city':'تهران'}
NAMES=['غذای خشک سگ بالغ','کنسرو غذای گربه','برس حیوانات خانگی','اسباب‌بازی طنابی','باکس حمل حیوانات','کاسه غذای سرامیکی']
PRICES=[6800000,1250000,3490000,1950000,9800000,2850000]
products=[]
for i in range(6):
 offer={'id':f'offer-{i}','sellerOrganization':SELLER,'productVariantId':f'variant-{i}','priceAmount':PRICES[i],'compareAtAmount':None,'currency':'IRR','status':'ACTIVE','availableQuantity':12,'effectiveUnitPrice':PRICES[i],'unitDiscount':0,'promotion':None,'stockState':'IN_STOCK','repeatDeliveryEligible':True,'repeatIntervalsDays':[30]}
 products.append({'id':f'p{i}','title':NAMES[i],'slug':f'product-{i}','brand':{'id':'brand-1','name':'همراه','slug':'companion','logoUrl':None,'status':'ACTIVE'},'category':CATS[i%4],'variantId':f'variant-{i}','variantTitle':'استاندارد','bestOffer':offer,'compatibility':None,'imageUrl':f'/__design-products/product-{i}.webp','stockState':'IN_STOCK','rating':{'average':None,'count':0},'supportsDog':i!=1,'supportsCat':i!=0})
line={'id':'line-1','sellerOffer':products[0]['bestOffer'],'productId':'p0','productTitle':NAMES[0],'variantTitle':'استاندارد','variantSku':'DEMO-1','targetPetId':'pet-1','targetPetName':'کوکی','quantity':1,'unitPriceSnapshot':PRICES[0],'currentPriceAmount':PRICES[0],'priceChanged':False,'currency':'IRR','lineTotal':PRICES[0],'compatibility':None,'listUnitPrice':PRICES[0],'unitDiscount':0,'promotionName':None,'promotionId':None,'issues':[]}
cart={'id':'cart-1','status':'ACTIVE','sellerGroups':[{'sellerOrganization':SELLER,'lines':[line],'subtotalAmount':PRICES[0]}],'totalItems':1,'subtotalAmount':PRICES[0],'currency':'IRR','hasSafetyConflict':False,'discountAmount':0,'hasBlockingIssues':False}
address={'id':'address-1','householdId':'h1','label':'خانه','recipient':'پدرام','phone':'+989120000000','addressLine':'تهران، خیابان نمونه، پلاک ۱','city':'تهران','countryCode':'IR','postalCode':'1234567890','isDefault':True}
order={'id':'order-1','checkoutId':'checkout-1','sellerOrganization':SELLER,'status':'CONFIRMED','paymentStatus':'CAPTURED','financingStatus':None,'refunds':[],'fulfillment':None,'subtotalAmount':PRICES[0],'deliveryAmount':0,'discountAmount':0,'totalAmount':PRICES[0],'currency':'IRR','shippingAddress':address,'items':[{'id':'item-1','productId':'p0','productVariantId':'variant-0','productTitleSnapshot':NAMES[0],'variantTitleSnapshot':'استاندارد','skuSnapshot':'DEMO-1','quantity':1,'unitPrice':PRICES[0],'totalPrice':PRICES[0],'targetPetId':'pet-1','compatibilitySnapshot':None,'listUnitPrice':None,'unitDiscount':0,'promotionName':None,'reviewId':None}],'createdAt':'2026-10-15T10:00:00Z','updatedAt':'2026-10-15T10:00:00Z','confirmedAt':'2026-10-15T10:00:00Z','orderNumber':'DEMO-1','cancelledAt':None,'cancelReason':None,'timeline':[],'refundRequests':[],'canCancel':False,'canRequestRefund':False}
requests=[]
def api(r):
 path=urlparse(r.request.url).path;qs=parse_qs(urlparse(r.request.url).query);status=200;requests.append({'method':r.request.method,'path':path,'query':qs,'body':r.request.post_data})
 if path=='/auth/session':data={'user':user}
 elif path=='/households':data=[{'id':'h1','name':'خانواده'}]
 elif path in ['/households/h1/active-pet','/pets/pet-1']:data=pet
 elif path=='/households/h1/pets':data=[pet]
 elif path=='/pets/pet-1/access':data=access
 elif path=='/notifications/unread-count':data={'count':0}
 elif path=='/shop/categories':data=CATS
 elif path=='/shop/products':
  items=[] if qs.get('onPromotion') else products
  data={'items':items,'total':len(items),'page':1,'pageSize':24,'facets':{'brands':[{'id':'brand-1','name':'همراه','count':6}],'sellers':[{'id':'seller-1','name':'فروشگاه همراه','count':6}],'attributes':[],'priceRange':{'min':1250000,'max':9800000}}}
 elif path=='/shop/products/p0':
  data={**products[0],'description':'تغذیه متعادل برای همراه شما. این اطلاعات صرفاً داده کنترل‌شده بررسی رابط است.','status':'ACTIVE','variants':[{'id':'variant-0','productId':'p0','sku':'DEMO-1','barcode':None,'title':'استاندارد','attributes':None,'weightValue':2,'weightUnit':'KG','isActive':True}],'offers':[products[0]['bestOffer']],'media':[{'id':'media-0','url':products[0]['imageUrl'],'alt':NAMES[0],'variantId':None}],'specifications':[],'defaultOfferId':'offer-0','reviews':[],'related':products[1:4],'favorited':False,'minAgeMonths':12,'maxAgeMonths':None,'minWeightKg':None,'maxWeightKg':None}
 elif path=='/cart' or path=='/cart/items':data=cart
 elif path=='/addresses':data=[address]
 elif path=='/orders/order-1':data=order
 elif path=='/orders':data=[]
 else:status=404;data={'error':{'code':'NOT_FOUND','message':'Not provided by controlled UI fixture','requestId':'design-review'}}
 r.fulfill(status=status,content_type='application/json',body=json.dumps(data))
out=root/'apps/web/design-review/approved-rollout/screenshots';out.mkdir(exist_ok=True)
original=api
provider={'id':'p1','name':'کلینیک مهر','type':'VET_CLINIC','verified':True,'description':'مراقبت تخصصی برای همراه شما، از معاینهٔ روزانه تا پیگیری درمان.','logoUrl':None,'coverImageUrl':'/images/experience/shop-companions.webp','specialties':['پزشکی عمومی'],'location':{'id':'l1','city':'تهران','region':'ونک','addressLine':'تهران، ونک'},'distanceKm':None,'services':[{'id':'s1','name':'ویزیت عمومی','category':'VET','type':'GENERAL_VET_VISIT','startingPrice':1000000,'currency':'IRR','durationMinutes':30,'homeVisit':False,'bookingMode':'INSTANT'}],'startingPrice':1000000,'currency':'IRR','nextAvailableAt':None,'rating':{'average':None,'count':0},'completedBookings':0,'petTypes':['DOG','CAT'],'homeVisit':False,'rankingScore':1}
article={'id':'a1','locale':'fa','slug':'care','canonicalPath':'/fa/blog/care','title':'هر روز، یک قدم نزدیک‌تر به زندگی سالم‌تر','excerpt':'راهنمای مراقبت روزانه از حیوانات خانگی و همراهی آگاهانه با آن‌ها.','coverMediaAsset':{'id':'m1','url':'/images/experience/shop-companions.webp','altText':'سگ و گربه'},'author':{'id':'author1','name':'تیم پت‌لایف','bio':None,'avatarMediaAsset':None},'category':{'id':'cat1','name':'مراقبت','slug':'care','description':None},'tags':[{'id':'t1','name':'سلامت','slug':'health'}],'publishedAt':'2026-10-10T10:00:00Z','updatedAt':'2026-10-10T10:00:00Z','body':[{'type':'paragraph','content':[{'text':'هر حیوان نیازهای ویژه‌ای دارد. برنامهٔ مراقبت را با دامپزشک هماهنگ کنید و تغییرات را به‌موقع ثبت کنید.'}]}],'seoTitle':None,'seoDescription':None,'estimatedReadingMinutes':4}
def mock(r):
 path=urlparse(r.request.url).path;data=None
 if path=='/discovery/providers':data={'total':3,'items':[dict(provider,id=f'p{i}',name=n) for i,n in enumerate(['کلینیک مهر','مرکز دامپزشکی همراه','کلینیک پارک'])]}
 elif path=='/discovery/cities':data=['تهران','کرج']
 elif path=='/discovery/providers/p1':data={**provider,'galleryUrls':[],'policiesText':'لغو رزرو طبق شرایط اعلام‌شده پیش از تأیید نهایی است.','faqs':[],'phone':None,'websiteUrl':None,'locations':[{'id':'l1','name':'شعبه ونک','city':'تهران','region':'ونک','addressLine':'تهران، ونک','countryCode':'IR','timezone':'Asia/Tehran','latitude':None,'longitude':None}],'services':[dict(provider['services'][0],variants=[],staffIds=[],paymentMode='AT_PROVIDER',depositAmount=None,description=None)],'team':[],'reviews':[]}
 elif path=='/me/favorite-providers':data=[]
 elif path=='/blog/categories':data=[article['category']]
 elif path=='/blog/articles':data={'items':[article],'total':1,'page':1,'pageSize':12}
 elif path=='/blog/articles/care':data=article
 elif path=='/admin/me':data={'isAdmin':True,'role':'SUPER_ADMIN','displayName':'پدرام','permissions':['support.view','task.manage','trust.view','system.view','finance.view','dispute.view','content.view','content.create','content.edit'],'adminUserId':'u1'}
 elif path=='/admin/dashboard':data={'openSupportCases':12,'openDisputes':3,'openTrustCases':5,'pendingRefundApprovals':2,'openTasks':8}
 elif '/admin/trust/queue/summary' in path:data={'total':0}
 elif '/admin/trust/queue' in path:data={'items':[],'total':0}
 elif path=='/admin/tasks':data={'items':[{'id':'task1','title':'پیگیری درخواست پشتیبانی','status':'OPEN','dueAt':None}],'total':1,'page':1,'pageSize':8}
 elif path=='/admin/system/health':data={'status':'HEALTHY','components':{k:{'status':'HEALTHY'} for k in ['api','database','redis','storage','outbox']}};data['components']['workers']=[]
 if data is None:return original(r)
 r.fulfill(status=200,content_type='application/json',body=json.dumps(data))
