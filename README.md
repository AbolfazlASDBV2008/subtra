🎌 Anime Subtitle Translator
> A powerful, modular, and advanced web-based tool for translating anime subtitle files (VTT, SRT, ASS) into fluent and professional Persian using the Google Gemini API.
> 
🌐 Live Demo:
https://abolfazlasdbv2008.github.io/subtra
This project is a comprehensive client-side tool that allows users to translate English (or Japanese) subtitles into Persian with exceptionally high quality, going far beyond simple machine translation. The tool focuses on localization and preserving the tone of dialogues, especially for anime, and provides the final output with a standard embedded Persian font (Vazirmatn).
🌟 Key Features
This tool offers a unique set of capabilities to provide the best possible translation output:
 * Smart Translation with the Latest Gemini Models: Supports a wide range of powerful Google models including Gemini 3.6 Flash, the Gemini 3.5 family, Pro versions, and ultra-fast Lite models.
 * Resume Capability: Automatically saves translation progress in the user's browser. In case of an error, internet disconnection, or closing the page, re-uploading the same file resumes the translation exactly from the dropped line.
 * Advanced AI Settings: Full control over the model's creativity via Temperature and Top-P settings, plus the ability to choose the output tone (informal for anime or formal/literary).
 * Thinking Mode: Utilizes high-level reasoning capabilities in supported models (like Gemini 3.5) for a better understanding of narrative complexities.
 * Smart Song Detection with AI & Karaoke: Intelligently scans the first and last 10 minutes of the file using AI to extract the exact timings of songs (OP/ED) and automatically applies colorful karaoke styles in the output file.
 * Custom Watermark: Add custom text or advertisements at the beginning and end of the subtitles, with precise customization of the start and display duration.
 * Comprehensive Backup (Export/Import): Export all settings, custom prompts, and configurations as a JSON file (with or without the API key) and easily restore them on other devices.
 * Support for Common Formats & Professional ASS Output: Accepts .vtt, .srt, or .ass inputs. All outputs are ultimately converted to the standard .ass format, fully preserving the original styling (positions, effects) of input ASS files.
 * Automatic Font Embedding: The Vazirmatn font is automatically embedded in the output .ass file to ensure flawless display on any system and media player.
 * Multi-Layer Self-Correction System: Smart and mandatory post-translation line checks; if lines are missed, or if English/Russian text or broken characters are detected, the tool automatically queues them for re-translation and correction.
 * Advanced Prompt Management: Offers a highly engineered and powerful default system prompt, with the ability to add, edit, and save custom user prompts.
 * Proxy Support & Safety Settings: Includes a built-in proxy (Worker) to bypass Google's geographical restrictions, and options to disable Gemini's content filters (censorship) for translating scenes with mature or violent content without interruptions.
 * Client-Side Processing & Live UI: Beautiful, responsive design with drag-and-drop support, live output streaming, detailed status logs, and UI optimizations for smooth performance even on lower-end devices.
🚀 How to Use
 * Get an API Key: First, get your free API key from Google AI Studio.
 * Initial Configuration:
   * Go to the "Settings" section and enter your API key (it will be encrypted and saved in your browser).
   * Select your preferred AI model (Flash series for speed, Pro for high accuracy).
   * Important: If you are in a region with network restrictions or face "Location" errors, enable the "Use Proxy (Worker)" option.
 * Personal Settings (Optional): In the advanced section, customize watermarks, temperature, translation tone, and thinking mode, and back up your settings if needed.
 * Select Files: Drag and drop your subtitle file(s) into the designated box or click to select them.
 * Select Output Format: Choose the final format between ASS (professional with styles) or SRT (simple).
 * Start Operation: Click the "Start Translation" button. You can monitor the progress, the AI's thinking process, and the incoming translations live in the output terminal.
 * Download Output: Once processing, error correction, and file reconstruction are complete, click "Download Subtitles" to get your final translated files.
⚙️ Key Settings Description
 * Temperature and Top-P: Lower values (e.g., 0.2) result in more precise/machine-like translations, while higher values (e.g., 0.7) yield more creative and fluent outputs.
 * Output Tone: Informal (for the casual anime atmosphere) and Formal (for documentaries or historical anime).
 * Frame Rate (FPS): Used to accurately calculate MicroDVD frames (the format sent to the AI).
 * Safety Settings: Disabling filters like Harassment, Hate Speech, etc., prevents translation halts in anime featuring explicit language or violent scenes.

👤 Developer
 * Abolfazl_ASDBV
   For contact, support, and updates, you can reach out via the following links:
 * Telegram Channel: Anime_sub_Persian
 * Instagram Page: anime_wd20


🎌 مترجم زیرنویس انیمه (Anime Subtitle Translator)
> یک ابزار تحت وب قدرتمند، ماژولار و پیشرفته برای ترجمه فایل‌های زیرنویس انیمه (VTT, SRT, ASS) به زبان فارسی روان و حرفه‌ای با استفاده از Google Gemini API.
> 
🌐 نسخه آنلاین و زنده (Live Demo):
https://abolfazlasdbv2008.github.io/subtra       
این پروژه یک ابزار کلاینت‌ساید جامع است که به کاربران اجازه می‌دهد زیرنویس‌های انگلیسی (یا ژاپنی) را با کیفیتی بسیار بالا، فراتر از ترجمه ماشینی ساده، به فارسی برگردانند. تمرکز این ابزار بر بومی‌سازی (Localization) و حفظ لحن دیالوگ‌ها، مخصوصاً برای انیمه است و خروجی نهایی را با فونت فارسی استاندارد (وزیرمتن) به صورت جاسازی شده ارائه می‌دهد.
🌟 ویژگی‌های کلیدی
این ابزار مجموعه‌ای از قابلیت‌های بی‌نظیر را برای ارائه بهترین خروجی ترجمه فراهم می‌کند:
 * ترجمه هوشمند با جدیدترین مدل‌های Gemini: پشتیبانی از طیف وسیعی از مدل‌های قدرتمند گوگل شامل Gemini 3.6 Flash، خانواده Gemini 3.5، نسخه‌های Pro و مدلهای فوق‌سریع Lite.
 * قابلیت ادامه کار (Resume Capability): ذخیره خودکار پیشرفت ترجمه در مرورگر کاربر. در صورت بروز خطا، قطعی اینترنت یا بستن صفحه، با آپلود مجدد همان فایل، ترجمه دقیقاً از خط رها شده ادامه می‌یابد.
 * تنظیمات پیشرفته هوش مصنوعی: امکان کنترل کامل روی خلاقیت مدل از طریق تنظیمات دما (Temperature) و محدوده درک (Top-P) به همراه قابلیت انتخاب لحن خروجی (محاوره‌ای برای انیمه یا رسمی/کتابی).
 * حالت تفکر عمیق (Thinking Mode): بهره‌گیری از قابلیت استدلال سطح بالا در مدل‌های پشتیبانی‌کننده (مثل Gemini 3.5) برای درک بهتر پیچیدگی‌های داستان.
 * تشخیص هوشمند آهنگ با AI و کارائوکه: اسکن هوشمندانه ۱۰ دقیقه ابتدا و انتهای فایل توسط هوش مصنوعی برای استخراج زمان دقیق آهنگ‌ها (OP/ED) و اعمال خودکار استایل‌های رنگی کارائوکه در فایل خروجی.
 * درج واترمارک اختصاصی: امکان افزودن متن یا تبلیغ دلخواه در ابتدا و انتهای زیرنویس با قابلیت شخصی‌سازی دقیق زمان شروع و پایان نمایش.
 * پشتیبان‌گیری جامع (Export/Import): امکان دریافت خروجی از تمامی تنظیمات، پرامپت‌های شخصی‌سازی‌شده و گزینه‌ها در قالب یک فایل JSON (با یا بدون کلید API) و بازیابی آسان آن‌ها در دستگاه‌های دیگر.
 * پشتیبانی از فرمت‌های رایج و خروجی حرفه‌ای ASS: ورودی می‌تواند .vtt، .srt یا .ass باشد. تمام خروجی‌ها در نهایت به فرمت استاندارد .ass تبدیل می‌شوند و استایل‌بندی اصلی فایل‌های ASS ورودی (موقعیت، افکت‌ها) کاملاً حفظ می‌گردد.
 * جاسازی خودکار فونت: فونت Vazirmatn به صورت خودکار در فایل خروجی .ass جاسازی (Embed) می‌شود تا زیرنویس در هر سیستم و پلیری بی‌نقص نمایش داده شود.
 * سیستم خود-اصلاح‌گر چندلایه (Self-Correction): بررسی هوشمند و اجباری خطوط پس از ترجمه؛ در صورت جا افتادن خطوط یا وجود متون انگلیسی، روسی یا کاراکترهای خراب، ابزار به طور خودکار آن‌ها را مجدداً برای ترجمه و اصلاح به صف می‌فرستد.
 * مدیریت پیشرفته پرامپت‌ها: ارائه یک پرامپت سیستمی مهندسی‌شده و قدرتمند به عنوان پیش‌فرض، با قابلیت افزودن، ویرایش و ذخیره‌سازی پرامپت‌های شخصی کاربر.
 * پشتیبانی از پراکسی و تنظیمات ایمنی: دارای پراکسی داخلی (Worker) برای دور زدن محدودیت‌های جغرافیایی گوگل، و گزینه‌هایی جهت غیرفعال کردن فیلترهای محتوایی (سانسور) Gemini برای ترجمه بدون سانسور صحنه‌های خشن یا بزرگسالانه.
 * پردازش سمت کاربر و رابط کاربری زنده: طراحی زیبا و ریسپانسیو با پشتیبانی از کشیدن و رها کردن فایل‌ها، نمایش زنده استریم خروجی، لاگ‌های دقیق وضعیت و بهینه‌سازی کامل رابط کاربری برای اجرا بدون افت فریم در دستگاه‌های ضعیف‌تر.
🚀 نحوه استفاده
 * دریافت کلید API: ابتدا کلید API رایگان خود را از Google AI Studio دریافت کنید.
 * پیکربندی اولیه:
   * به بخش «تنظیمات» بروید و کلید API را وارد کنید (در مرورگر شما رمزنگاری و ذخیره می‌شود).
   * مدل هوش مصنوعی دلخواه را انتخاب نمایید (سری Flash برای سرعت و Pro برای دقت بالا توصیه می‌شود).
   * مهم: اگر در ایران هستید یا با خطای شبکه/تحریم مواجه می‌شوید، گزینه «استفاده از پراکسی (Worker)» را فعال کنید.
 * تنظیمات شخصی (اختیاری): در بخش پیشرفته می‌توانید واترمارک، دما، لحن ترجمه و حالت تفکر را شخصی‌سازی کرده و در صورت نیاز از کل تنظیمات بک‌آپ بگیرید.
 * انتخاب فایل‌ها: فایل(های) زیرنویس خود را در کادر مشخص شده رها (Drag & Drop) کنید یا با کلیک روی کادر، آن‌ها را برگزینید.
* انتخاب فرمت خروجی: فرمت نهایی را از بین ASS (حرفه‌ای با استایل) یا SRT (ساده) انتخاب کنید.
 * شروع عملیات: دکمه «شروع ترجمه» را بزنید. روند کار، تفکر هوش مصنوعی و ترجمه‌های دریافتی را می‌توانید به صورت زنده در ترمینال خروجی مشاهده کنید.
 * دریافت خروجی: پس از پردازش، رفع خطاها و بازسازی فایل، با کلیک روی «دریافت زیرنویس‌ها» خروجی‌های نهایی را دانلود کنید.
⚙️ توضیحات تنظیمات کلیدی
 * دما (Temperature) و Top-P: مقادیر پایین‌تر (مثلاً 0.2) باعث ترجمه دقیق‌تر و ماشینی‌تر، و مقادیر بالاتر (مثلاً 0.7) باعث ترجمه خلاقانه‌تر و روان‌تر می‌شوند.
 * لحن خروجی: محاوره‌ای (برای فضای صمیمی انیمه) و رسمی (برای مستندها یا انیمه‌های تاریخی).
 * نرخ فریم (FPS): برای محاسبه دقیق فریم‌های MicroDVD (فرمت ارسالی به هوش مصنوعی) کاربرد دارد.
 * تنظیمات ایمنی: خاموش کردن فیلترهای Harassment، Hate Speech و ... مانع از توقف ترجمه در انیمه‌های دارای کلمات رکیک یا صحنه‌های خشن می‌شود.

👤 توسعه‌دهنده
 * Abolfazl_ASDBV
   برای ارتباط، پشتیبانی و اطلاع از به‌روزرسانی‌ها می‌توانید از طریق لینک‌های زیر در ارتباط باشید:
 * کانال تلگرام: Anime_sub_Persian
 * صفحه اینستاگرام: anime_wd20