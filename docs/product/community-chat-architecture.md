# چت جامعه — معماری نسخهٔ ۱

**دامنه:** گفت‌وگوی خصوصی یک‌به‌یک بین اعضای PET LIFE. گروه، دنبال‌کردن، استوری، تماس صوتی/تصویری، واکنش، «در حال نوشتن» و حضور آنلاین **در این نسخه نیست**.
**تحویل:** polling (بدون websocket). اعلان پیام جدید از زیرساخت موجود اعلان‌ها.

## مدل داده (افزایشی)
| مدل | فیلدهای کلیدی | قید |
|---|---|---|
| `ChatConversation` | `pairKey` (شناسهٔ دو کاربر، مرتب‌شده)، `lastMessageAt` | `pairKey` یکتا — بین دو نفر فقط یک گفت‌وگو |
| `ChatParticipant` | `conversationId`، `userId`، `lastReadAt` | کلید مرکب؛ ایندکس روی `userId` |
| `ChatMessage` | `senderUserId`، `body` (≤ ۲۰۰۰ نویسه)، `status` (`PUBLISHED`/`HIDDEN`/`REMOVED`، همان enum جامعه) | ایندکس `(conversationId, createdAt)` |
| `UserBlock` | `blockerUserId`، `blockedUserId` | کلید مرکب |
| `CommunityReport.chatMessageId` | هدف جدید در صف گزارش موجود | — |

## API
| متد | مسیر | توضیح |
|---|---|---|
| POST | `/chat/conversations` `{participantUserId}` | باز کردن یا ساختن گفت‌وگوی ۱:۱ (idempotent) |
| GET | `/chat/conversations` | فهرست گفت‌وگوهای خود کاربر، آخرین پیام، تعداد خوانده‌نشده |
| GET | `/chat/conversations/:id/messages?before=&limit=` | صفحه‌بندی رو به عقب (حداکثر ۵۰) |
| POST | `/chat/conversations/:id/messages` `{body}` | ارسال؛ محدودیت نرخ ۳۰ در دقیقه |
| POST | `/chat/conversations/:id/read` | علامت خوانده‌شدن تا الان |
| GET | `/chat/unread-count` | جمع پیام‌های خوانده‌نشده |
| GET/POST/DELETE | `/chat/blocks`، `/chat/blocks/:userId` | مسدودسازی؛ DELETE فقط مسدودی خود کاربر را برمی‌دارد و اگر چنین مسدودی‌ای نباشد **۴۰۴** می‌دهد |
| POST | `/reports` `{targetType:"CHAT_MESSAGE"}` | گزارش پیام (فقط عضو همان گفت‌وگو) |

## امنیت و حریم خصوصی
- فقط اعضای گفت‌وگو به آن دسترسی دارند. گفت‌وگوی دیگران و گفت‌وگوی ناموجود پاسخ یکسان **۴۰۴** دارند، پس شمارش و حدس‌زدن ممکن نیست.
- هیچ endpoint عمومی پیام وجود ندارد.
- خلاصه‌ی هر گفت‌وگو دو فیلد دارد: `blocked` یعنی مسدود از هر طرف، و `blockedByMe` یعنی کاربر خودش مسدود کرده. دکمه‌ی «رفع مسدودی» فقط وقتی `blockedByMe` درست است نمایش داده شود.
- **مسدودسازی** دوطرفه اثر دارد: گفت‌وگوی جدید باز نمی‌شود و پیام جدید ارسال نمی‌شود (`CHAT_BLOCKED`). تاریخچه برای هر دو طرف خواندنی می‌ماند.
- پیام `HIDDEN`/`REMOVED` (پس از رسیدگی ناظر) دیگر برگردانده نمی‌شود.
- **محدودیت‌ها:** طول متن، نرخ ارسال، و اندازهٔ صفحه.
- **نظارت:** گزارش وارد همان صف `CommunityReport` و قابل ارجاع به Trust & Safety می‌شود؛ UI ادمین با Codex است.
- **اعلان:** نوع `community.chat_message` با deep link به `/community/messages/:id`، و یکتاسازی بر اساس رویداد.
