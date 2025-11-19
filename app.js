document.addEventListener('DOMContentLoaded', () => {

    // --- 0. توابع کمکی ---
    function escapeHTML(str) {
        if (typeof str !== 'string') return str;
        return str.replace(/[&<>"']/g, m => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'}[m]));
    }

    function isRomajiOrKanji(text) {
        if (!text) return false;
        
        // --- مرحله ۱: گسترش کاراکترهای مجاز ---
        // اضافه شدن: ♪, (), *, …, ♡, :, /
        const allowedCharsRegex = /^[a-zA-Z\s\.,!\?'"\-\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF♪\(\)\*…♡:\/]+$/;
        
        if (!allowedCharsRegex.test(text)) {
            // اگر کاراکترهای غیرمجاز داشته باشد (مثلاً ایموجی‌های دیگر)، به عنوان دیالوگ در نظر بگیر
            return false; 
        }

        // --- مرحله ۲: بررسی وجود حروف ژاپنی ---
        const hiragana = /[\u3040-\u309F]/;
        const katakana = /[\u30A0-\u30FF]/;
        const kanji = /[\u4E00-\u9FFF]/;
        const hasJapanese = hiragana.test(text) || katakana.test(text) || kanji.test(text);

        if (hasJapanese) {
            // منطق اصلی: ژاپنی دارد و فقط کاراکترهای مجاز دارد = آهنگ است
            return true; 
        }

        // --- مرحله ۳: مدیریت آهنگ‌های تماماً روماجی (بدون ژاپنی) ---
        // اگر ژاپنی ندارد، شاید آهنگ روماجی یا دیالوگ انگلیسی باشد
        // ما به یک عامل تعیین‌کننده نیاز داریم: نشانگرهای آهنگ
        
        // [!!!] اصلاحیه نهایی: ستاره (*) یک نشانگر آهنگ قابل اعتماد نیست و حذف شد.
        const songMarkerRegex = /[♪♡]/; // فقط نت موسیقی یا قلب
        
        if (songMarkerRegex.test(text)) {
            // تماماً روماجی است اما نشانگر آهنگ (واقعی) دارد
            // مثال: "♪ Let's sing this song! ♪"
            return true;
        }

        // --- مرحله ۴: پیش‌فرض ---
        // فقط حروف لاتین و نقطه‌گذاری ساده (و شاید *) دارد
        // نه ژاپنی دارد و نه نشانگر آهنگ (♪ یا ♡)
        // این به احتمال زیاد یک دیالوگ انگلیسی یا تایتل مثل مورد شما است
        return false;
    }


    // --- 1. انتخاب عناصر HTML ---
    const apiKeyInput = document.getElementById('apiKey');
    const modelSelect = document.getElementById('modelSelect');
    const fpsInput = document.getElementById('fpsInput');
    const systemPrompt = document.getElementById('systemPrompt');
    const saveSettings = document.getElementById('saveSettings');
    const settingsSaved = document.getElementById('settingsSaved');
    const resetSettings = document.getElementById('resetSettings'); // [جدید]
    const settingsReset = document.getElementById('settingsReset'); // [جدید]
    
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    const fileList = document.getElementById('fileList');
    const clearFileList = document.getElementById('clearFileList'); 
    
    const startTranslation = document.getElementById('startTranslation');
    const stopTranslation = document.getElementById('stopTranslation');
    const downloadFiles = document.getElementById('downloadFiles');
    
    const overallProgressSection = document.getElementById('overallProgressSection');
    const overallProgressBar = document.getElementById('overallProgressBar');
    const overallProgressLabel = document.getElementById('overallProgressLabel');
    const statusLog = document.getElementById('statusLog');
    
    const liveOutput = document.getElementById('liveOutput'); 
    const translationStatusMessage = document.getElementById('translationStatusMessage'); 
    const proxyToggle = document.getElementById('proxy-toggle'); 
    const safetyHarassmentToggle = document.getElementById('safety-harassment-toggle'); 
    const safetyHateSpeechToggle = document.getElementById('safety-hate-speech-toggle'); 
    const safetySexuallyExplicitToggle = document.getElementById('safety-sexually-explicit-toggle'); 
    const safetyDangerousContentToggle = document.getElementById('safety-dangerous-content-toggle'); 

    const outputFormatSelector = document.getElementById('outputFormatSelector');

    const errorModal = document.getElementById('errorModal');
    const errorMessageContainer = document.getElementById('errorMessageContainer');
    const closeModal = document.getElementById('closeModal');

    // --- 2. متغیرهای وضعیت ---
    let uploadedFiles = []; 
    let processedFiles = []; 
    let isTranslating = false;
    let abortController = null; 
    let userManuallyAborted = false; // [!!!] متغیر جدید برای تشخیص توقف توسط کاربر [!!!]
    
    let assFormatFields = ['Layer', 'Start', 'End', 'Style', 'Name', 'MarginL', 'MarginR', 'MarginV', 'Effect', 'Text'];
    let styleFormatFields = ['Name', 'Fontname', 'Fontsize', 'PrimaryColour', 'SecondaryColour', 'OutlineColour', 'BackColour', 'Bold', 'Italic', 'Underline', 'StrikeOut', 'ScaleX', 'ScaleY', 'Spacing', 'Angle', 'BorderStyle', 'Outline', 'Shadow', 'Alignment', 'MarginL', 'MarginR', 'MarginV', 'Encoding'];

    // [!!!] Regex برای فیلتر کردن دستورات رسم ASS [!!!]
    const drawingCommandRegex = /^\s*(m|l|b|s|p|c)\s/i; 

    const defaultPrompt = `
پرامپت پیشرفته و یکپارچه برای ترجمه حرفه‌ای زیرنویس انیمه (فرمت 'میکرو دی وی دی') 

مأموریت شما:
شما یک دستیار هوش مصنوعی متخصص در ترجمه حرفه‌ای و بومی‌سازی زیرنویس انیمه هستید. وظیفه شما دریافت یک فایل زیرنویس انگلیسی با فرمت 'میکرو دی وی دی' و ارائه ترجمه‌ای بی‌نقص، روان، جذاب و وفادار به زبان فارسی است، به گونه‌ای که تجربه تماشای انیمه برای مخاطب فارسی‌زبان، غنی و لذت‌بخش باشد.

فایل ورودی:
یک فایل متنی حاوی زیرنویس انگلیسی یک انیمه در فرمت 'میکرو دی وی دی'.

---

فرایند پردازش و ترجمه (مبتنی بر خود-اصلاحی):

شما باید این فرآیند را در سه گام ذهنی و متوالی اجرا کنید:

گام ۱: تحلیل جامع و تولید پیش‌نویس اولیه
* اسم انیمه را از نام فایل ورودی شناسایی کرده و بر اساس موضوع داستانی آن، تحلیل را آغاز کن.
* پیش از شروع ترجمه، کل محتوای زیرنویس را بخوانید تا ژانر، فضای داستانی، و ویژگی‌های شخصیتی کاراکترها را (تا حد امکان بر اساس دیالوگ‌های موجود) درک کنید.
* ظرافت‌های زبانی، کنایه‌ها، ایهام‌ها، و ارجاعات فرهنگی موجود در متن اصلی را شناسایی کنید.
* در مرحله‌ی اندیشیدن، بر اساس این درک عمیق، یک پیش‌نویس اولیه از ترجمه را تولید کنید. (این پیش‌نویس داخلی است و به کاربر نمایش داده نمی‌شود).

گام ۲: بازبینی موشکافانه و پالایش (مرحله خود-اصلاحی)
* حالا با نگاه یک ویراستار سخت‌گیر، پیش‌نویس خود را به چالش بکشید. هر خط را با در نظر گرفتن تمام اصول کلیدی ترجمه (که در ادامه آمده) بازبینی کنید.
* از خود بپرسید: آیا این جمله روان است یا "بوی ترجمه" می‌دهد؟ آیا لحن شخصیت حفظ شده؟ آیا معادل بهتری برای این اصطلاح وجود دارد؟
* متن را ویرایش و پالایش کنید تا به بهترین نسخه ممکن برسید.

گام ۳: ارائه خروجی نهایی
* نسخه نهایی و بی‌نقص را که حاصل گام دوم است، به عنوان خروجی قطعی ارائه دهید.

---

اصول کلیدی ترجمه (قوانین حاکم بر گام‌های بالا):

1.  وفاداری به معنا و مفهوم، نه ترجمه تحت‌اللفظی: هدف اصلی، انتقال دقیق پیام و حس دیالوگ اصلی است. از ترجمه کلمه به کلمه که منجر به عبارات نامأنوس یا بی‌معنی در فارسی می‌شود، اکیداً پرهیز کنید.
2.  اولویت با زبان فارسی محاوره‌ای و انسان‌گونه: ترجمه باید به زبان فارسی امروزی، طبیعی، روان و «انسان‌گونه» باشد، نه یک ترجمه ماشینی و خشک. **اگر بین وفاداری کلمه به کلمه و یک عبارت روان و طبیعی فارسی تضاد وجود داشت، همواره عبارت روان و طبیعی را انتخاب کن**، به شرطی که مفهوم اصلی دیالوگ حفظ شود. متن نهایی باید به‌راحتی خوانده شود و برای مخاطب عام فارسی‌زبان کاملاً قابل فهم و گیرا باشد.
3.  حفظ لحن و سبک شخصیت‌ها: لحن هر کاراکتر (رسمی، دوستانه، طنزآمیز، جدی، خشن، معصومانه و...) و سبک گفتاری او باید با دقت در ترجمه فارسی بازتاب داده شود.
4.  بومی‌سازی هوشمندانه اصطلاحات و ارجاعات فرهنگی:
    * اصطلاحات، ضرب‌المثل‌ها، شوخی‌ها و عبارات خاص فرهنگی انیمه را شناسایی کنید.
    * اولویت با یافتن معادل‌های دقیق، رایج و طبیعی در زبان و فرهنگ فارسی است.
    * در صورتی که معادل مستقیمی وجود ندارد، یا استفاده از آن به اصالت اثر لطمه می‌زند، سعی کنید مفهوم را با خلاقیت و به شکلی که برای مخاطب فارسی‌زبان قابل درک باشد، منتقل کنید. (مثلاً گاهی یک توضیح کوتاه درون پرانتز در خود زیرنویس لازم است، اما این مورد را تنها در صورت ضرورت انجام دهید و اولویت با معادل‌یابی است).
5.  دقت و صحت کامل:
    * ترجمه باید عاری از هرگونه اشتباه گرامری, املایی و معنایی باشد.
    * تمامی جزئیات موجود در زیرنویس اصلی، از جمله اعداد، اسامی خاص (شخصیت‌ها، مکان‌ها، تکنیک‌ها و...) و علائم نگarشی باید با دقت و به درستی به فارسی برگردانده شوند.
6.  یکپارچگی و ثبات: در طول ترجمه کل فایل، برای اسامی، اصطلاحات و عبارات تکرارشونده، از معادل‌های یکسان استفاده کنید تا انسجام متن حفظ شود.

---

محدودیت‌های زبانی:

* زبان پایه فارسی: ترجمه باید کاملاً به زبان فارسی باشد.
* استفاده از واژگان انگلیسی: از به‌کار بردن کلمات غیرفارسی پرهیز کنید. تنها در صورتی مجاز به استفاده از واژه انگلیسی هستید که آن واژه یک نام خاص، برند، یا اصطلاح فنی شناخته‌شده باشد که معادل فارسی رایج و جاافتاده‌ای ندارد و استفاده از اصل کلمه به درک بهتر کمک می‌کند. اولویت مطلق با واژگان فارسی است.
* حفظ کاراکتر : در صورت وجود کاراکتر پایپ‌لاین (\`|\`) و کاراکترهای آکولاد (\`{\`) و (\`}\`) در متن اصلی، این کاراکتر باید بدون هیچ تغییری در متن ترجمه‌شده نیز حفظ شود.
* نکته آکولاد: تعداد آکولاد خروجی باید برابر با ورودی باشه، و وجود آن در ترجمه نباید تاثیر منفی بگذارد و قرار دادن آن در خروجی فقط یک استایل نمایشی می‌باشد.

---

ساختار و فرمت خروجی:

1.  تطابق کامل با فرمت ورودی: خروجی باید *دقیقا* با حفظ ساختار، فرمت، شماره‌گذاری خطوط و به‌ویژه زمان‌بندی فایل اصلی 'میکرو دی وی دی' ارائه شود. هر خط ترجمه شده باید متناظر با خط اصلی در فایل ورودی باشد.
2.  محتوای خروجی: خروجی نهایی باید *صرفاً* یک بلوک کد باشد که *فقط و فقط* شامل متن ترجمه‌شده‌ی زیرنویس به فارسی است.
3.  عدم وجود اطلاعات اضافی در بلوک کد: هیچ‌گونه توضیح، مقدمه، تفسیر، یادداشت مترجم یا هرگونه متن اضافی دیگری نباید *درون* این بلوک کد قرار گیرد.

تأکید نهایی:
شما باید تمامی این دستورالعمل‌ها را با دقت مرور کرده و اطمینان حاصل کنید که خروجی شما دقیقاً مطابق با موارد ذکر شده است. هدف، ارائه یک ترجمه حرفه‌ای و بی‌نقص است که نیازی به ویرایش مجدد نداشته باشد.
    `.trim().replace('لذت‌bخش', 'لذت‌بخش');

    // --- 3. مدیریت تنظیمات (شامل پراکسی و ایمنی) ---

    function loadSettings() {
        apiKeyInput.value = localStorage.getItem('geminiApiKey') || '';
        modelSelect.value = localStorage.getItem('geminiModel') || 'gemini-2.5-pro';
        fpsInput.value = localStorage.getItem('subtitleFPS') || '23.976';
        systemPrompt.value = localStorage.getItem('geminiPrompt') || defaultPrompt;
        proxyToggle.checked = localStorage.getItem('proxyEnabled') === 'true';
        
        try {
            const savedSafety = localStorage.getItem('safetySettings');
            if (savedSafety) {
                const settings = JSON.parse(savedSafety);
                safetyHarassmentToggle.checked = settings.harassment || false;
                safetyHateSpeechToggle.checked = settings.hateSpeech || false;
                safetySexuallyExplicitToggle.checked = settings.sexuallyExplicit || false;
                safetyDangerousContentToggle.checked = settings.dangerousContent || false;
            }
        } catch (e) {
            console.error("Failed to load safety settings:", e);
            localStorage.removeItem('safetySettings');
        }
    }

    function saveSafetySettings() {
        const settings = {
            harassment: safetyHarassmentToggle.checked,
            hateSpeech: safetyHateSpeechToggle.checked,
            sexuallyExplicit: safetySexuallyExplicitToggle.checked,
            dangerousContent: safetyDangerousContentToggle.checked
        };
        localStorage.setItem('safetySettings', JSON.stringify(settings));
    }

    saveSettings.addEventListener('click', () => {
        localStorage.setItem('geminiApiKey', apiKeyInput.value);
        localStorage.setItem('geminiModel', modelSelect.value);
        localStorage.setItem('subtitleFPS', fpsInput.value);
        localStorage.setItem('geminiPrompt', systemPrompt.value);
        localStorage.setItem('proxyEnabled', proxyToggle.checked);
        saveSafetySettings();
        
        settingsSaved.classList.remove('hidden');
        settingsReset.classList.add('hidden'); // [جدید]
        setTimeout(() => settingsSaved.classList.add('hidden'), 3000);
    });
    
          // [!!!] دکمه بازنشانی تنظیمات [!!!]
    resetSettings.addEventListener('click', () => {
        // 1. بازنشانی پرامپت
        systemPrompt.value = defaultPrompt;
        
        // 2. بازنشانی پراکسی
        proxyToggle.checked = false; // پیش‌فرض خاموش است
        
        // 3. بازنشانی تنظیمات ایمنی
        safetyHarassmentToggle.checked = false;
        safetyHateSpeechToggle.checked = false;
        safetySexuallyExplicitToggle.checked = false;
        safetyDangerousContentToggle.checked = false;
        
        // [!!!] 4. بازنشانی FPS (جدید) [!!!]
        fpsInput.value = '23.976'; // بازگشت به مقدار پیش‌فرض

        // 5. نمایش پیام تایید
        settingsReset.classList.remove('hidden');
        settingsSaved.classList.add('hidden'); // مخفی کردن پیام دیگر
        setTimeout(() => settingsReset.classList.add('hidden'), 3000);
    });
    
    // --- 4. مدیریت آپلود فایل (اصلاح شده) ---
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', (e) => { e.preventDefault(); dropZone.classList.remove('drag-over'); });
    dropZone.addEventListener('drop', (e) => { e.preventDefault(); dropZone.classList.remove('drag-over'); handleFiles(e.dataTransfer.files); });
    fileInput.addEventListener('change', (e) => { handleFiles(e.target.files); });

    function handleFiles(files) {
        const newFiles = Array.from(files).filter(file => {
            if (!/\.(srt|vtt|ass)$/i.test(file.name)) {
                showError(`فایل "${escapeHTML(file.name)}" فرمت پشتیبانی نشده دارد.`);
                return false;
            }
            if (file.size === 0) {
                showError(`فایل "${escapeHTML(file.name)}" خالی است و نادیده گرفته شد.`);
                return false;
            }
            if (file.size > 50 * 1024 * 1024) { // 50MB limit
                showError(`فایل "${escapeHTML(file.name)}" (${(file.size / 1024 / 1024).toFixed(1)}MB) از حد مجاز 50MB حجیم‌تر است و نادیده گرفته شد.`);
                return false;
            }
            return true;
        });
        
        uploadedFiles = newFiles;
        
        if (uploadedFiles.length > 0) {
            startTranslation.disabled = false;
            downloadFiles.disabled = true;
            processedFiles = [];
            updateFileListUI();
            clearFileList.style.display = 'block';

            const hasAssFile = uploadedFiles.some(f => f.name.endsWith('.ass'));
            outputFormatSelector.style.display = hasAssFile ? 'block' : 'none';
        }
    }
    function updateFileListUI() {
        fileList.innerHTML = ''; 
        uploadedFiles.forEach((file, index) => {
            const fileElement = document.createElement('div');
            fileElement.id = `file-${index}`;
            fileElement.className = 'bg-gray-700 p-3 rounded-lg flex items-center justify-between';
            // [!!!] اصلاح: استفاده از break-words به جای truncate برای نمایش نام کامل فایل‌های طولانی
            fileElement.innerHTML = `
                <div class="flex-1 min-w-0">
                    <p class="text-sm font-medium text-white break-words leading-tight">${escapeHTML(file.name)}</p>
                    <p class="text-xs text-gray-400 mt-1" id="file-status-${index}">در صف</p>
                </div>
                <div class="w-24 ml-4 flex-shrink-0">
                    <div class="w-full bg-gray-600 rounded-full h-2.5">
                        <div id="file-progress-${index}" class="bg-blue-500 h-2.5 rounded-full progress-bar-inner" style="width: 0%"></div>
                    </div>
                </div>
            `;
            fileList.appendChild(fileElement);
        });
    }
    function updateFileStatus(index, status, progress = -1) {
        const statusEl = document.getElementById(`file-status-${index}`);
        const progressEl = document.getElementById(`file-progress-${index}`);
        if (statusEl) statusEl.textContent = status;
        if (progressEl && progress >= 0) progressEl.style.width = `${progress}%`;
        
        const totalFiles = uploadedFiles.length;
        const fileProgress = progress < 0 ? 0 : (progress / 100); 
        const filesDone = processedFiles.length;
        const overallProgress = ((filesDone + fileProgress) / totalFiles) * 100;
        
        overallProgressBar.style.width = `${overallProgress}%`;
        overallProgressLabel.textContent = `پیشرفت کلی: ${filesDone} از ${totalFiles} کامل شده (فایل فعلی: ${status})`;
    }
    
    clearFileList.addEventListener('click', () => {
        uploadedFiles = [];
        processedFiles = [];
        fileList.innerHTML = '';
        fileInput.value = ''; 
        
        startTranslation.disabled = true;
        downloadFiles.disabled = true;
        clearFileList.style.display = 'none';
        
        const outputFormatRadio = document.querySelector('input[name="output-format"][value="ass"]');
        if (outputFormatRadio) outputFormatRadio.checked = true;
        outputFormatSelector.style.display = 'none';

        overallProgressSection.style.display = 'none';
        overallProgressBar.style.width = '0%';
        overallProgressLabel.textContent = 'پیشرفت کلی';
        statusLog.innerHTML = '';
        statusLog.style.display = 'none';
        liveOutput.textContent = '';
        liveOutput.style.display = 'none';
        translationStatusMessage.classList.add('hidden');
    });


    // --- 5. توابع پارسر (اصلاح شده و ایمن‌شده) ---
    
    function parseTimeToMS(timeStr) {
      if (!timeStr) return 0;
      try {
          const parts = timeStr.trim().replace(',', '.').split(':').reverse();
          const s = parseFloat(parts[0]) || 0;
          const m = parseInt(parts[1], 10) || 0;
          const h = parseInt(parts[2], 10) || 0;
          if (isNaN(s) || isNaN(m) || isNaN(h)) return 0;
          return Math.round((h * 3600 + m * 60 + s) * 1000);
      } catch(e) {
          console.error("Error parsing time:", timeStr, e);
          return 0;
      }
    }

    function msToASS(ms) {
      const totalSec = Math.floor(ms/1000);
      const cs = Math.floor((ms % 1000) / 10); // centiseconds
      const h = Math.floor(totalSec/3600);
      const m = Math.floor((totalSec%3600)/60);
      const s = totalSec%60;
      return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(cs).padStart(2,'0')}`;
    }
    
    function msToSrtTime(ms) {
        const date = new Date(ms);
        const hours = date.getUTCHours().toString().padStart(2, '0');
        const minutes = date.getUTCMinutes().toString().padStart(2, '0');
        const seconds = date.getUTCSeconds().toString().padStart(2, '0');
        const milliseconds = date.getUTCMilliseconds().toString().padStart(3, '0');
        return `${hours}:${minutes}:${seconds},${milliseconds}`;
    }
    
    function robustAssSplit(dialogueLine, formatFieldsArray) {
        const parts = [];
        let rest = dialogueLine;
        
        const textIndex = formatFieldsArray.map(f => f.toLowerCase()).indexOf('text');
        const splitCount = textIndex > -1 ? textIndex : formatFieldsArray.length - 1;

        for (let i = 0; i < splitCount; i++) {
            const commaIndex = rest.indexOf(',');
            if (commaIndex === -1) {
                parts.push(rest);
                rest = '';
                break; 
            }
            parts.push(rest.slice(0, commaIndex));
            rest = rest.slice(commaIndex + 1);
        }
        parts.push(rest); 

        if (parts.length > formatFieldsArray.length) {
             const textParts = parts.slice(formatFieldsArray.length - 1);
             parts.splice(formatFieldsArray.length - 1, parts.length - (formatFieldsArray.length - 1), textParts.join(','));
        }

        return parts;
    }

    function parseSRT(data) {
        const blocks = [];
        const lines = data.split(/\r?\n/);
        let i = 0;
        while (i < lines.length) {
            if (lines[i] && /^\d+$/.test(lines[i].trim())) {
                const index = parseInt(lines[i].trim());
                i++;
                if (lines[i] && lines[i].includes('-->')) {
                    const [startStr, endStr] = lines[i].split(' --> ');
                    const start = msToASS(parseTimeToMS(startStr));
                    const end = msToASS(parseTimeToMS(endStr));
                    i++;
                    let text = [];
                    while (lines[i] && lines[i].trim() !== '') {
                        text.push(lines[i].trim());
                        i++;
                    }
                    
                    const joinedText = text.join('\n');

                    // [!!!] فیلتر کردن دستورات رسم [!!!]
                    if (drawingCommandRegex.test(joinedText)) {
                        continue;
                    }

                    if (joinedText.trim()) {
                        blocks.push({ index, start, end, style: "Default", text: joinedText });
                    }
                }
            }
            i++;
        }
        return blocks;
    }
    
    function parseVTT(data) {
        const blocks = [];
        const lines = data.replace(/WEBVTT[^\n]*\n(\n)*/, '').split(/\r?\n/);
        let i = 0;
        let index = 1;
        while (i < lines.length) {
            if (lines[i] && lines[i].includes('-->')) {
                const timeParts = lines[i].split(' --> ');
                const startStr = timeParts[0].trim();
                const endStr = timeParts[1].trim().split(' ')[0]; 
                const start = msToASS(parseTimeToMS(startStr));
                const end = msToASS(parseTimeToMS(endStr));
                i++;
                let text = [];
                while (lines[i] && lines[i].trim() !== '') {
                    text.push(lines[i].trim().replace(/<[^>]+>/g, ''));
                    i++;
                }
                
                const joinedText = text.join('\n');

                // [!!!] فیلتر کردن دستورات رسم [!!!]
                if (drawingCommandRegex.test(joinedText)) {
                    continue;
                }
                
                if (joinedText.trim()) {
                    blocks.push({ index, start, end, style: "Default", text: joinedText });
                    index++;
                }
            }
            i++;
        }
        return blocks;
    }
    
    function parseASS(data) {
        assFormatFields = ['Layer', 'Start', 'End', 'Style', 'Name', 'MarginL', 'MarginR', 'MarginV', 'Effect', 'Text'];
        
        const blocks = [];
        const lines = data.split(/\r?\n/);
        let eventsSection = false;
        
        for (const line of lines) {
            const trimmedLine = line.trim();
            if (trimmedLine.toLowerCase() === '[events]') { eventsSection = true; continue; }
            if (!eventsSection) continue;
            
            if (trimmedLine.toLowerCase().startsWith('format:')) { 
                assFormatFields = trimmedLine.substring(7).trim().split(',').map(f => f.trim()); 
                continue; 
            }
            
            if (trimmedLine.toLowerCase().startsWith('dialogue:')) {
                const parts = robustAssSplit(trimmedLine.substring(9).trim(), assFormatFields);
                if (parts.length < assFormatFields.length) continue; 

                const dialogueObj = {};
                assFormatFields.forEach((field, i) => { dialogueObj[field] = parts[i]; });

                const rawText = dialogueObj.Text || "";
                const textWithoutTags = rawText.replace(/\{[^}]*\}/g, '').trim();

                if (!textWithoutTags) continue;
                if (rawText.trim().endsWith('{\\p0}')) continue;
                if (drawingCommandRegex.test(textWithoutTags)) continue; // فیلتر موجود
                if (rawText.includes('{') && textWithoutTags.replace(/\\N/g, '').replace(/\\h/g, ' ').length <= 2 && textWithoutTags.length > 0) {
                    continue;
                }

                blocks.push({
                    index: blocks.length + 1,
                    start: dialogueObj.Start, end: dialogueObj.End, style: dialogueObj.Style || "Default",
                    layer: dialogueObj.Layer || '0', name: dialogueObj.Name || '',
                    marginL: dialogueObj.MarginL || '0', marginR: dialogueObj.MarginR || '0',
                    marginV: dialogueObj.MarginV || '0', effect: dialogueObj.Effect || '',
                    text: dialogueObj.Text 
                });
            }
        }
        return blocks;
    }
    
    function cleanAssToSrt(assContent) {
        assFormatFields = ['Layer', 'Start', 'End', 'Style', 'Name', 'MarginL', 'MarginR', 'MarginV', 'Effect', 'Text'];
        
        const lines = assContent.split('\n');
        const dialogues = [];
        let eventsSection = false;
        
        for (const line of lines) {
            const trimmedLine = line.trim();
            
            if (trimmedLine.toLowerCase() === '[events]') { eventsSection = true; continue; }
            if (!eventsSection) continue;
            
            if (trimmedLine.toLowerCase().startsWith('format:')) { 
                assFormatFields = trimmedLine.substring(7).trim().split(',').map(f => f.trim()); 
                continue; 
            }
            
            if (trimmedLine.toLowerCase().startsWith('dialogue:')) {
                const parts = robustAssSplit(trimmedLine.substring(9).trim(), assFormatFields);
                if (parts.length < assFormatFields.length) continue;

                const dialogueObj = {};
                assFormatFields.forEach((field, i) => { dialogueObj[field] = parts[i]; });
                
                const startTimeStr = dialogueObj.Start;
                const endTimeStr = dialogueObj.End;
                const rawText = dialogueObj.Text || "";
                
                const textWithoutTags = rawText.replace(/\{[^}]*\}/g, '').trim();

                if (!textWithoutTags) continue;
                if (rawText.trim().endsWith('{\\p0}')) continue;
                if (drawingCommandRegex.test(textWithoutTags)) continue; // فیلتر موجود
                if (rawText.includes('{') && textWithoutTags.replace(/\\N/g, '').replace(/\\h/g, ' ').length <= 2 && textWithoutTags.length > 0) {
                    continue;
                }
                
                const cleanedText = textWithoutTags.replace(/\\h/g, ' ').replace(/\\n/g, '\r\n').replace(/\\N/g, '\r\n');

                if (cleanedText) {
                    dialogues.push({
                        start: parseTimeToMS(startTimeStr),
                        end: parseTimeToMS(endTimeStr),
                        text: cleanedText
                    });
                }
            }
        }

        dialogues.sort((a, b) => a.start - b.start);

        let srtOutput = '';
        let srtIndex = 1;
        for (const sub of dialogues) {
            const startTime = msToSrtTime(sub.start);
            const endTime = msToSrtTime(sub.end);
            srtOutput += `${srtIndex}\r\n${startTime} --> ${endTime}\r\n${sub.text}\r\n\r\n`;
            srtIndex++;
        }
        return srtOutput.trim();
    }

    function processAssForTranslationAndMapping(assContent, fps) {
        assFormatFields = ['Layer', 'Start', 'End', 'Style', 'Name', 'MarginL', 'MarginR', 'MarginV', 'Effect', 'Text'];
        
        const lines = assContent.split(/\r?\n/);
        const mapping = [];
        const microdvdLines = [];
        let eventsSection = false;
        
        function msToFrames(ms, fps) {
            return Math.floor((ms / 1000) * fps);
        }

        lines.forEach((line, index) => {
            const trimmedLine = line.trim();

            if (trimmedLine.toLowerCase() === '[events]') { eventsSection = true; return; }
            if (!eventsSection) return;
            
            if (trimmedLine.toLowerCase().startsWith('format:')) { 
                assFormatFields = trimmedLine.substring(7).trim().split(',').map(f => f.trim()); 
                return; 
            }

            if (trimmedLine.toLowerCase().startsWith('dialogue:')) {
                const parts = robustAssSplit(trimmedLine.substring(9).trim(), assFormatFields);
                if (parts.length < assFormatFields.length) return;

                const dialogueObj = {};
                assFormatFields.forEach((field, i) => { dialogueObj[field] = parts[i]; });

                const dialoguePart = dialogueObj.Text || "";
                const textWithoutTags = dialoguePart.replace(/\{[^}]*\}/g, '').trim();

                if (!textWithoutTags) return;
                if (dialoguePart.trim().endsWith('{\\p0}')) return;
                if (drawingCommandRegex.test(textWithoutTags)) return; // فیلتر موجود
                if (dialoguePart.includes('{') && textWithoutTags.replace(/\\N/g, '').replace(/\\h/g, ' ').length <= 2 && textWithoutTags.length > 0) return;

                let textForAI = '';
                let isComplex = false;
                let segmentsForRemapping = null;
                
                const dialogueWithoutItalics = dialoguePart.replace(/\{\\i1\}/g, '').replace(/\{\\i0\}/g, '');
                const originalTextOnly = dialogueWithoutItalics.replace(/\{[^}]*\}/g, '');

                if (dialogueWithoutItalics.replace(originalTextOnly, '') !== '' && originalTextOnly.trim() !== '') {
                    isComplex = true;
                    segmentsForRemapping = [];
                    
                    const tokenRegex = /(\{[^}]*?\})|([^{}]+)/g;
                    let match;
                    while ((match = tokenRegex.exec(dialoguePart)) !== null) {
                        if (match[1]) { // تگ
                            segmentsForRemapping.push({ isTag: true, content: match[1] });
                        } else if (match[2]) { // متن
                            segmentsForRemapping.push({ isTag: false, content: match[2] });
                            const cleanSegment = match[2].replace(/\\N/g, '|').replace(/\\h/g, ' ').trim();
                            if (cleanSegment) {
                                textForAI += `{${cleanSegment}}`;
                            }
                        }
                    }
                    textForAI = textForAI.trim();
                } else {
                    isComplex = false;
                    textForAI = textWithoutTags.replace(/\\N/g, '|').replace(/\\h/g, ' ');
                }

                if (textForAI.trim()) {
                    const startTimeMs = parseTimeToMS(dialogueObj.Start);
                    const endTimeMs = parseTimeToMS(dialogueObj.End);
                    const startFrame = msToFrames(startTimeMs, fps);
                    const endFrame = msToFrames(endTimeMs, fps);
                    const microdvdTime = `{${startFrame}}{${endFrame}}`;
                    
                    mapping.push({
                        lineNumber: index,
                        microdvdTime: microdvdTime,
                        isComplex: isComplex,
                        segments: segmentsForRemapping
                    });
                    
                    microdvdLines.push(`${microdvdTime}${textForAI}`);
                }
            }
        });

        return {
            map: mapping,
            microdvdForAI: microdvdLines.join('\n')
        };
    }

    function createTranslationLookupMap(translatedMicroDVD) {
        const lookupMap = new Map();
        const lines = translatedMicroDVD.split(/\r?\n/);
        const lineRegex = /^\{(\d+)\}\{(\d+)\}(.*)$/;

        for (const line of lines) {
            const match = line.trim().match(lineRegex);
            if (match) {
                const timeKey = `{${match[1]}}{${match[2]}}`;
                let text = match[3];

                if (text.startsWith('{') && text.endsWith('}')) {
                    const segments = text.replace(/^\{|\}$/g, '').split('}{');
                    const rtlFixedSegments = segments.map(segment => 
                        segment.split('|').map(part => `\u202B${part.trim()}\u202C`).join('|')
                    );
                    text = `{${rtlFixedSegments.join('}{')}}`;
                } else {
                    text = text.split('|').map(part => `\u202B${part.trim()}\u202C`).join('|');
                }

                if (lookupMap.has(timeKey)) {
                    lookupMap.get(timeKey).push(text);
                } else {
                    lookupMap.set(timeKey, [text]);
                }
            }
        }
        return lookupMap;
    }

    function rebuildAssFromTranslation(originalAssContent, mapping, translationLookup) {
        assFormatFields = ['Layer', 'Start', 'End', 'Style', 'Name', 'MarginL', 'MarginR', 'MarginV', 'Effect', 'Text'];
        
        const originalLines = originalAssContent.split(/\r?\n/);
        let untranslatedInRebuild = 0;
        let styleReplacementFailureCount = 0;
        let eventsSection = false;

        for (const line of originalLines) {
             const trimmedLine = line.trim();
             if (trimmedLine.toLowerCase() === '[events]') { eventsSection = true; continue; }
             if (!eventsSection) continue;
             if (trimmedLine.toLowerCase().startsWith('format:')) { 
                assFormatFields = trimmedLine.substring(7).trim().split(',').map(f => f.trim()); 
                break; 
             }
        }

        mapping.forEach(mapItem => {
            const { lineNumber, microdvdTime, isComplex, segments } = mapItem;

            if (translationLookup.has(microdvdTime) && translationLookup.get(microdvdTime).length > 0) {
                const translatedText = translationLookup.get(microdvdTime).shift(); 
                
                const originalLine = originalLines[lineNumber];
                if (!originalLine || !originalLine.toLowerCase().startsWith('dialogue:')) return;

                const parts = robustAssSplit(originalLine.substring(9).trim(), assFormatFields);
                if (parts.length < assFormatFields.length) return;

                let newDialoguePart = '';

                if (isComplex && segments) {
                    const translatedSegments = translatedText.replace(/^\{|\}$/g, '').split('}{');
                    let translatedIndex = 0;
                    
                    const rebuiltSegments = segments.map(segment => {
                        if (segment.isTag) {
                            return segment.content;
                        } else {
                            const cleanOriginalSegment = segment.content.replace(/\\N/g, ' ').replace(/\\h/g, ' ').trim();
                            if (cleanOriginalSegment && translatedIndex < translatedSegments.length) {
                                const currentTranslation = translatedSegments[translatedIndex].replace(/\|/g, '\\N');
                                translatedIndex++;
                                return currentTranslation;
                            }
                            return ''; 
                        }
                    });
                    newDialoguePart = rebuiltSegments.join('');

                    if (translatedIndex !== translatedSegments.length) {
                         styleReplacementFailureCount++;
                         newDialoguePart = translatedText.replace(/\{/g, '').replace(/\}/g, ' ').replace(/\|/g, '\\N').trim();
                    }

                } else {
                    const finalTranslation = translatedText.replace(/\|/g, '\\N');
                    
                    const dialogueObj = {};
                    assFormatFields.forEach((field, i) => { dialogueObj[field] = parts[i]; });
                    const originalDialoguePart = dialogueObj.Text || "";

                    const dialogueWithoutItalics = originalDialoguePart.replace(/\{\\i1\}/g, '').replace(/\{\\i0\}/g, '');
                    const originalTextOnly = dialogueWithoutItalics.replace(/\{[^}]*\}/g, '');
                    
                    if(originalTextOnly.trim()) {
                       newDialoguePart = dialogueWithoutItalics.replace(originalTextOnly, finalTranslation);
                    } else {
                       newDialoguePart = dialogueWithoutItalics + finalTranslation;
                    }
                }

                const dialogueObjRebuild = {};
                assFormatFields.forEach((field, i) => { dialogueObjRebuild[field] = parts[i]; });
                dialogueObjRebuild['Text'] = newDialoguePart; 
                
                const newParts = assFormatFields.map(field => dialogueObjRebuild[field]);
                originalLines[lineNumber] = 'Dialogue: ' + newParts.join(',');

            } else {
                untranslatedInRebuild++;
            }
        });
        
        return {
            rebuiltAss: originalLines.join('\r\n'),
            untranslatedCount: untranslatedInRebuild,
            styleReplacementFailureCount: styleReplacementFailureCount
        };
    }

    async function finalizeAssFile(assContent) {
        try {
            // [!!!] اصلاح مهم: مسیردهی فایل فونت [!!!]
            // مرورگر فایل fontVazirmatn.txt را در ریشه (root) سایت جستجو می‌کند.
            // مطمئن شوید این فایل در کنار index.html شما وجود دارد.
            const fontResponse = await fetch('./fontVazirmatn.txt'); 
            if (!fontResponse.ok) throw new Error('فایل فونت (fontVazirmatn.txt) پیدا نشد.');
            const fontData = await fontResponse.text();

            const lines = assContent.split(/\r?\n/);
            const newLines = [];
            let inStylesSection = false;
            let inEventsSection = false;
            let inFontsSection = false;
            
            let fontNameIndex = 1; // پیش‌فرض
            styleFormatFields = ['Name', 'Fontname', 'Fontsize', 'PrimaryColour', 'SecondaryColour', 'OutlineColour', 'BackColour', 'Bold', 'Italic', 'Underline', 'StrikeOut', 'ScaleX', 'ScaleY', 'Spacing', 'Angle', 'BorderStyle', 'Outline', 'Shadow', 'Alignment', 'MarginL', 'MarginR', 'MarginV', 'Encoding'];
            
            const fnTagRegex = /\\fn[^\\}]+/g;
            const fspTagRegex = /\\fsp-?\d+/g;

            for (const line of lines) {
                let currentLine = line;
                const trimmedLine = line.trim().toLowerCase();

                if (trimmedLine === '[v4+ styles]') {
                    inStylesSection = true; inEventsSection = false; inFontsSection = false;
                } else if (trimmedLine === '[events]') {
                    inStylesSection = false; inEventsSection = true; inFontsSection = false;
                } else if (trimmedLine.startsWith('[fonts]')) { 
                    inStylesSection = false; inEventsSection = false; inFontsSection = true;
                } else if (trimmedLine.startsWith('[')) {
                    inStylesSection = false; inEventsSection = false; inFontsSection = false;
                }

                if (inStylesSection && trimmedLine.startsWith('format:')) {
                    styleFormatFields = trimmedLine.substring(7).trim().split(',').map(f => f.trim());
                    const index = styleFormatFields.map(f => f.toLowerCase()).indexOf('fontname');
                    if (index > -1) {
                        fontNameIndex = index;
                    }
                }

                if (inStylesSection && trimmedLine.startsWith('style:')) {
                    const parts = currentLine.split(','); 
                    if (parts.length > fontNameIndex && parts.length >= styleFormatFields.length) {
                        parts[fontNameIndex] = 'Vazirmatn Medium'; 
                        parts[styleFormatFields.length - 1] = '1'; 
                        currentLine = parts.join(',');
                    }
                } else if (inEventsSection && trimmedLine.startsWith('dialogue:')) {
                    currentLine = line.replace(fnTagRegex, '').replace(fspTagRegex, '');
                } else if (inFontsSection) {
                    continue; 
                }
                
                newLines.push(currentLine);
            }

            let finalContent = newLines.join('\r\n');
            finalContent = finalContent.replace(/\[fonts\][\s\S]*$/i, '').trim();
            
            finalContent += '\r\n\r\n[Fonts]\r\n' + fontData;

            return finalContent;
        } catch (error) {
            console.error("خطا در پیوست کردن فونت:", error);
            addLog(`خطا در جاسازی فونت: ${error.message}. فایل بدون فونت خروجی گرفته می‌شود.`, true);
            return assContent; 
        }
    }
    
    // --- 6. توابع API و مدیریت خطا ---

    function timeToFrames(time, fps) {
        const ms = parseTimeToMS(time);
        return Math.floor((ms / 1000) * fps);
    }

    function mergeTrustedFramesWithAiText(originalMicroDVD, aiOutputMicroDVD) {
        if (!originalMicroDVD) return { mergedTextLines: [], untranslatedCount: 0, untranslatedLinesData: [] };
        const originalLines = originalMicroDVD.trim().split('\n');
        if (!aiOutputMicroDVD) return { mergedTextLines: originalLines, untranslatedCount: originalLines.length, untranslatedLinesData: [] }; 

        const aiLines = aiOutputMicroDVD.trim().split('\n');
        const translatedTextMap = new Map();
        const microDVDLineRegex = /^{(\d+)}{(\d+)}(.*)$/;

        for (const line of aiLines) {
            const match = line.trim().match(microDVDLineRegex);
            if (match) {
                const timeBlockKey = `{${match[1]}}{${match[2]}}`;
                translatedTextMap.set(timeBlockKey, match[3]);
            }
        }

        const mergedLines = [];
        let untranslatedLinesData = []; 
        
        for (let i = 0; i < originalLines.length; i++) { 
            const originalLine = originalLines[i];
            const originalMatch = originalLine.match(microDVDLineRegex);
            
            if (originalMatch) {
                const timeBlockKey = `{${originalMatch[1]}}{${originalMatch[2]}}`;
                if (translatedTextMap.has(timeBlockKey)) {
                    const translatedText = translatedTextMap.get(timeBlockKey);
                    mergedLines.push(`${timeBlockKey}${translatedText}`);
                } else {
                    mergedLines.push(originalLine); 
                    untranslatedLinesData.push({
                        indexInMerged: i, 
                        originalText: originalMatch[3] 
                    });
                }
            } else {
                 mergedLines.push(originalLine); 
            }
        }
        
        return { 
            mergedTextLines: mergedLines, 
            untranslatedCount: untranslatedLinesData.length,
            untranslatedLinesData: untranslatedLinesData 
        };
    }
    
    function checkTranslationCompleteness(translatedMicroDVD, originalLastEndFrame) {
        const lines = translatedMicroDVD.split('\n');
        const lineRegex = /\{(\d+)\}\{(\d+)\}(.*)/;
        for (let i = lines.length - 1; i >= 0; i--) {
            const line = lines[i].trim();
            const match = line.match(lineRegex);
            if (match) {
                const translatedEndFrame = parseInt(match[2], 10);
                return translatedEndFrame === originalLastEndFrame;
            }
        }
        return false; 
    }

    async function handleFetchError(response) {
        const errorText = await response.text();
        if (errorText.trim().startsWith('<!DOCTYPE html>') || errorText.includes('</head>')) {
            if (errorText.includes('Error 524')) return 'خطای Timeout از پراکسی (Error 524): پاسخ از سرور گوگل بیش از حد طول کشیده است.';
            if (errorText.includes('Error 522')) return 'خطای Connection Timeout از پراکسی (Error 522): پراکسی نتوانست به سرور گوگل متصل شود.';
            if (errorText.includes('Error 520')) return 'خطای ناشناخته از پراکسی (Error 520): پراکسی یک پاسخ نامعتبر دریافت کرده است.';
            return 'یک خطای ناشناخته HTML از سمت پراکسی دریافت شد.';
        }
        try {
            const errorJson = JSON.parse(errorText);
            if (errorJson.error && errorJson.error.message) {
                return errorJson.error.message;
            }
            return `پاسخ JSON نامعتبر از سرور: ${JSON.stringify(errorJson, null, 2)}`;
        } catch (e) {
            return `یک پاسخ غیرمنتظره از سرور دریافت شد: "${errorText.substring(0, 100)}..."`;
        }
    }
    
    function uploadFileToGemini(processedText, originalFilename, apiKey, onProgress, signal) {
        return new Promise((resolve, reject) => {
            const proxyEnabled = proxyToggle.checked;
            const GEMINI_BASE_URL = proxyEnabled ? 'https://anime-translator-web.khalilkhko.workers.dev' : 'https://generativelanguage.googleapis.com';
            const url = `${GEMINI_BASE_URL}/upload/v1beta/files?key=${apiKey}`;
            
            const formData = new FormData();
            const fileToUpload = new File([processedText], originalFilename, { type: 'text/plain' });
            formData.append('file', fileToUpload);

            const xhr = new XMLHttpRequest();
            xhr.open('POST', url, true);

            xhr.upload.onprogress = (event) => {
                if (event.lengthComputable && typeof onProgress === 'function') {
                    const percentage = (event.loaded / event.total) * 100;
                    onProgress(percentage);
                }
            };
            
            xhr.onload = async () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    if(typeof onProgress === 'function') onProgress(100);
                    resolve(JSON.parse(xhr.responseText).file.uri);
                } else {
                    const errorMsg = await handleFetchError({ text: () => Promise.resolve(xhr.responseText) });
                    reject(new Error(`خطا در آپلود فایل: ${errorMsg}`));
                }
            };
            
            xhr.onerror = () => reject(new Error('خطای شبکه هنگام آپلود فایل رخ داد.'));
            signal.addEventListener('abort', () => xhr.abort());
            xhr.send(formData);
        });
    }
    
    // --- 7. منطق خود-اصلاح‌گری (شامل پرامپت‌های اصلاح شده) ---
    async function performSelfCorrection(texts, fileIndex, model, apiKey, prompt) {
        
        const foreignScriptRegex = /[\u0400-\u04FF\u0370-\u03FF\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF\uAC00-\uD7AF\u0E00-\u0E7F\u0900-\u097F\u0980-\u09FF\u0B80-\u0BFF\u0C00-\u0C7F\u0590-\u05FF]/;
        const persianRegex = /[\u0600-\u06FF]/; // We might not need this anymore
        const englishRegex = /[a-zA-Z]/;
        const badCharacterRegex = /[\u0000-\u001F\u007F-\u009F\uFFFD\u061C]/;

        let linesToRetry = [];
        for (let i = 0; i < texts.length; i++) {
            if (typeof texts[i] !== 'string') continue; 
            
            const textPart = (texts[i].match(/\{(\d+)\}\{(\d+)\}(.*)/) || [])[3] || '';
            const textWithoutTags = textPart.replace(/\{[^}]+\}/g, ' ').trim();
            
            if (!textWithoutTags) continue; // Skip empty lines

            const isSong = isRomajiOrKanji(textWithoutTags);
            
            // If it's a song, we trust it (it was handled by the romaji prompt)
            if (isSong) continue; 

            // If it's NOT a song, check for problems:
            const hasForeign = foreignScriptRegex.test(textWithoutTags);
            const hasEnglish = englishRegex.test(textWithoutTags);
            const hasBadChars = badCharacterRegex.test(textWithoutTags);
            // const hasPersian = persianRegex.test(textWithoutTags); // This is not needed for the check

            if (hasForeign || hasBadChars || hasEnglish) {
                // This will catch:
                // 1. Foreign script (e.g., Cyrillic) -> hasForeign = true
                // 2. Bad characters -> hasBadChars = true
                // 3. English-only lines (e.g., "Episode 8") -> hasEnglish = true
                // 4. Mixed lines (e.g., "سلام friend") -> hasEnglish = true
                linesToRetry.push({ index: i, text: textPart });
            } 
        }
        
        if (linesToRetry.length === 0) {
            addLog("بررسی کامل شد. خطای ترجمه ناقص یا خراب یافت نشد."); 
            return texts; 
        }

        addLog(`تعداد ${linesToRetry.length} خطای ترجمه (انگلیسی، ترکیبی، خارجی یا خراب) یافت شد. در حال تلاش برای اصلاح...`, false, "yellow"); 
        updateFileStatus(fileIndex, `در حال اصلاح ${linesToRetry.length} خطا...`, 85);
        
        const RETRY_CHUNK_SIZE = 10;
        const totalChunks = Math.ceil(linesToRetry.length / RETRY_CHUNK_SIZE);
        let correctedCount = 0;

        for (let i = 0; i < totalChunks; i++) {
            if (abortController.signal.aborted) throw new Error("عملیات لغو شد");
            
            const chunk = linesToRetry.slice(i * RETRY_CHUNK_SIZE, (i + 1) * RETRY_CHUNK_SIZE);
            const originalChunkTexts = chunk.map(l => l.text);
            
            // [!!!] پرامپت اصلاح شده با ممنوعیت صریح شکستن خط [!!!]
            const promptText = `خطوط زیر (که با '|||' جدا شده‌اند) شامل خطا هستند (ترجمه ناقص، کلمات انگلیسی، کاراکتر خراب).
لطفاً **هر خط را به صورت کامل** به فارسی روان و صحیح بازنویسی کن.
پاسخ‌ها باید **دقیقاً با همان تعداد خطوط ارسالی** و با جداکننده '|||' برگردانده شوند.
**مهم: هرگز یک خط ورودی را به چند خط خروجی (با '|||' اضافی) تقسیم نکن.**
ساختار کلی خط (مانند تگ‌های |) را حفظ نما.

خطوط برای اصلاح:
${originalChunkTexts.join('|||')}`;
            
            try {
                const response = await callSimpleGeminiAPI(prompt, promptText, model, apiKey);
                const correctedChunk = response.split('|||').map(t => t.trim());

                if (correctedChunk.length === chunk.length) {
                    for (let j = 0; j < chunk.length; j++) {
                        const originalIndex = chunk[j].index;
                        const timePartMatch = texts[originalIndex].match(/\{(\d+)\}\{(\d+)\}/);
                        if (timePartMatch) {
                            texts[originalIndex] = `${timePartMatch[0]}${correctedChunk[j]}`; 
                            correctedCount++;
                        }
                    }
                } else { addLog(`خطا در اصلاح بخش ${i + 1}. تعداد ارسالی: ${chunk.length}، دریافتی: ${correctedChunk.length}`, true); }
            } catch (error) { addLog(`خطا در API هنگام اصلاح بخش ${i + 1}: ${error.message}`, true); }
        }
        addLog(`اصلاح ${correctedCount} خط کامل شد.`);
        return texts;
    }
    
    async function callSimpleGeminiAPI(systemInstruction, userPrompt, model, apiKey) {
        if (abortController?.signal.aborted) throw new Error("عملیات لغو شد");
        
        const proxyEnabled = proxyToggle.checked;
        const GEMINI_BASE_URL = proxyEnabled ? 'https://anime-translator-web.khalilkhko.workers.dev' : 'https://generativelanguage.googleapis.com';
        const API_URL = `${GEMINI_BASE_URL}/v1beta/models/${model}:generateContent?key=${apiKey}`;

        const safetySettings = [];
        if (safetyHarassmentToggle.checked) safetySettings.push({ category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" });
        if (safetyHateSpeechToggle.checked) safetySettings.push({ category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" });
        if (safetySexuallyExplicitToggle.checked) safetySettings.push({ category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" });
        if (safetyDangerousContentToggle.checked) safetySettings.push({ category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" });

        const payload = {
            systemInstruction: { parts: [{ text: systemInstruction }] },
            contents: [{ parts: [{ text: userPrompt }] }],
            generationConfig: { temperature: 0.2, topP: 1, }
        };
        if (safetySettings.length > 0) payload.safetySettings = safetySettings;


        const MAX_ATTEMPTS = 3; // 3 Attempts for retryable errors (like 503)
        const RETRY_DELAY = 10000; // 10 seconds

        for (let attempt = 1; attempt <= MAX_ATTEMPTS + 1; attempt++) {
            if (abortController?.signal.aborted) throw new Error("عملیات لغو شد");
            
            try {
                const response = await fetch(API_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                    signal: abortController?.signal
                });

                if (response.ok) {
                    const result = await response.json();
                    if (result.candidates && result.candidates[0].content && result.candidates[0].content.parts) {
                        return result.candidates[0].content.parts[0].text;
                    } else {
                        throw new Error("پاسخ دریافتی از API نامعتبر است (SelfCorrection).");
                    }
                }
                throw new Error(await handleFetchError(response));

            } catch (error) {
                if (abortController?.signal.aborted) throw new Error("عملیات لغو شد");

                const errorMessage = error.message.toLowerCase();
                
                // [!!!] قانون جدید: اگر خطا لیمیت (Quota) بود، فوراً متوقف شود [!!!]
                if (errorMessage.includes('resource exhausted') || errorMessage.includes('quota exceeded')) {
                     throw new Error("LIMIT_REACHED: " + error.message); 
                }

                const isRetryable = errorMessage.includes('overloaded') || 
                                  errorMessage.includes('503') || 
                                  errorMessage.includes('524') ||
                                  errorMessage.includes('networkerror');

                if (isRetryable && attempt <= MAX_ATTEMPTS) {
                    addLog(`خطای شلوغی سرور (تلاش ${attempt} از ${MAX_ATTEMPTS}). ${RETRY_DELAY / 1000} ثانیه صبر می‌کنیم...`, false, "yellow");
                    await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
                } else {
                    throw error; // اگر لیمیت بود یا تلاش‌ها تمام شد، خطا را پرتاب کن
                }
            }
        }
        throw new Error("Failed after max retries.");
    }
    
    async function performMissingLineCorrection(mergedLinesArray, untranslatedData, fileIndex, model, apiKey, systemPrompt) {
        if (untranslatedData.length === 0) {
            return mergedLinesArray; 
        }

        addLog(`تعداد ${untranslatedData.length} خط جا افتاده (ترجمه نشده) یافت شد. در حال تلاش برای ترجمه...`, false, "yellow");
        updateFileStatus(fileIndex, `در حال ترجمه ${untranslatedData.length} خط جا افتاده...`, 82); 

        const RETRY_CHUNK_SIZE = 10;
        const totalChunks = Math.ceil(untranslatedData.length / RETRY_CHUNK_SIZE);
        let correctedCount = 0;

        for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
            if (abortController.signal.aborted) throw new Error("عملیات لغو شد");

            const chunk = untranslatedData.slice(chunkIndex * RETRY_CHUNK_SIZE, (chunkIndex + 1) * RETRY_CHUNK_SIZE);
            const originalChunkTexts = chunk.map(l => l.originalText);
            
            // [!!!] پرامپت اصلاح شده با ممنوعیت صریح شکستن خط [!!!]
            const promptText = `خطوط انگلیسی زیر در ترجمه اولیه جا افتاده‌اند و با '|||' جدا شده‌اند.
لطفاً **هر خط را به صورت کامل** به فارسی روان ترجمه کن.
پاسخ‌ها باید **دقیقاً با همان تعداد خطوط ارسالی** و با جداکننده '|||' برگردانده شوند.
**مهم: هرگز یک خط ورودی را به چند خط خروجی (با '|||' اضافی) تقسیم نکن.**
مثال:
ورودی: "Line 1|||Line 2"
خروجی مجاز: "ترجمه خط ۱|||ترجمه خط ۲"
خروجی ممنوع: "ترجمه خط ۱|||بخش دوم خط ۱|||ترجمه خط ۲"

خطوط برای ترجمه:
${originalChunkTexts.join('|||')}`;
            
            try {
                const response = await callSimpleGeminiAPI(systemPrompt, promptText, model, apiKey);
               const correctedChunk = response.split('|||').map(t => t.trim()).filter(t => t.length > 0);

                // --- [!!!] منطق اصلاح شده برای مدیریت کردیت‌ها [!!!] ---
                
                if (correctedChunk.length === chunk.length) {
                    // [CASE 1: 1-to-1 match (e.g., 3 sent, 3 received)]
                    // حالت ایده‌آل
                    for (let j = 0; j < chunk.length; j++) {
                        const originalData = chunk[j];
                        const originalLineIndex = originalData.indexInMerged;
                        
                        const timePartMatch = mergedLinesArray[originalLineIndex].match(/\{(\d+)\}\{(\d+)\}/);
                        if (timePartMatch) {
                            const timePart = timePartMatch[0];
                            mergedLinesArray[originalLineIndex] = `${timePart}${correctedChunk[j]}`; 
                            correctedCount++;
                        }
                    }
                } else if (chunk.length === 1 && correctedChunk.length > 1) {
                    // [CASE 2: 1-to-many match (e.g., 1 sent, 5 received)]
                    // این حالت دیگر نباید رخ دهد، اما برای اطمینان آن را نگه می‌داریم
                    addLog(`اصلاح ویژه: 1 خط به ${correctedChunk.length} خط تبدیل شد (مورد کردیت‌ها).`, false, "yellow");
                    const originalData = chunk[0];
                    const originalLineIndex = originalData.indexInMerged;
                    const timePartMatch = mergedLinesArray[originalLineIndex].match(/\{(\d+)\}\{(\d+)\}/);
                    
                    if (timePartMatch) {
                        const timePart = timePartMatch[0];
                        const newText = correctedChunk.join('|'); 
                        mergedLinesArray[originalLineIndex] = `${timePart}${newText}`;
                        correctedCount++;
                    }
                } else if (chunk.length > 1 && correctedChunk.length > chunk.length) {
                    // [CASE 3: N-to-M match (e.g., 3 sent, 5 received)]
                    // *** این حالت هم دیگر نباید رخ دهد ***
                    addLog(`اصلاح ویژه: عدم تطابق (${chunk.length} به ${correctedChunk.length}). در حال ادغام همه خطوط در خط اول...`, false, "yellow");
                    
                    const newText = correctedChunk.join('|'); 
                    
                    const firstOriginalData = chunk[0];
                    const firstLineIndex = firstOriginalData.indexInMerged;
                    const firstTimePartMatch = mergedLinesArray[firstLineIndex].match(/\{(\d+)\}\{(\d+)\}/);
                    
                    if (firstTimePartMatch) {
                        mergedLinesArray[firstLineIndex] = `${firstTimePartMatch[0]}${newText}`;
                        correctedCount++;
                    }
                    for (let j = 1; j < chunk.length; j++) {
                        const subData = chunk[j];
                        const subLineIndex = subData.indexInMerged;
                        const subTimePartMatch = mergedLinesArray[subLineIndex].match(/\{(\d+)\}\{(\d+)\}/);
                        if (subTimePartMatch) {
                            mergedLinesArray[subLineIndex] = `${subTimePartMatch[0]}`; 
                        }
                    }
                } else {
                    // [CASE 4: Error]
                    addLog(`خطا در ترجمه خطوط جا افتاده (بخش ${chunkIndex + 1}). تعداد خطوط ارسالی: ${chunk.length}, تعداد خطوط دریافتی: ${correctedChunk.length}.`, true);
                    addLog(`متن ارسالی: ${originalChunkTexts.join('|||')}`, true);
                    addLog(`پاسخ دریافتی: ${response}`, true);
                }
            } catch (error) {
                addLog(`خطا در API هنگام ترجمه خطوط جا افتاده بخش ${chunkIndex + 1}: ${error.message}`, true);
            }
        }
        addLog(`ترجمه ${correctedCount} خط جا افتاده کامل شد.`);
        return mergedLinesArray;
    }


    // --- 8. منطق اصلی ترجمه (بازنویسی و ارتقا یافته) ---
    
    // [!!!] تابع getTranslationStream اصلاح شده برای پذیرش پرامپت سیستم و محتوای جداگانه [!!!]
    async function getTranslationStream(systemInstruction, modelContents, onChunk, onEnd, onError, signal) {
        const apiKey = apiKeyInput.value.trim();
        const model = modelSelect.value;
        
        const proxyEnabled = proxyToggle.checked;
        const GEMINI_BASE_URL = proxyEnabled ? 'https://anime-translator-web.khalilkhko.workers.dev' : 'https://generativelanguage.googleapis.com';
        const url = `${GEMINI_BASE_URL}/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;

        try {
            const safetySettings = [];
            if (safetyHarassmentToggle.checked) safetySettings.push({ category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" });
            if (safetyHateSpeechToggle.checked) safetySettings.push({ category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" });
            if (safetySexuallyExplicitToggle.checked) safetySettings.push({ category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" });
            if (safetyDangerousContentToggle.checked) safetySettings.push({ category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" });

            const requestBody = {
                systemInstruction: { parts: [{ text: systemInstruction }] },
                contents: modelContents, // استفاده از محتوای ارسال شده
                generationConfig: {
                    temperature: 0.3, 
                    topP: 0.9,      
                }
            };
            if (safetySettings.length > 0) requestBody.safetySettings = safetySettings;

            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
                signal: signal 
            });
            
            if (!response.ok) throw new Error(await handleFetchError(response));
            
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let fullText = '';
            let buffer = '';

            while (true) {
                const { value, done } = await reader.read();
                if (done) {
                    if (buffer.startsWith('data: ')) {
                        try {
                            const jsonStr = buffer.substring(5);
                            const parsed = JSON.parse(jsonStr);
                            const textPart = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
                            if (textPart) fullText += textPart;
                        } catch (e) { console.warn("Could not parse final buffer chunk:", buffer); }
                    }
                    break;
                }

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split(/\r?\n/);
                buffer = lines.pop(); 

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const jsonStr = line.substring(5);
                        try {
                            const parsed = JSON.parse(jsonStr);
                            const textPart = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
                            if (textPart) {
                                fullText += textPart;
                                onChunk(fullText); 
                             }
                        } catch (e) { console.warn("Could not parse a JSON chunk:", jsonStr); }
                    }
                }
            }
            onEnd(fullText);
        } catch(error) { 
            if (error.name === 'AbortError') {
                console.log('Fetch aborted by user.');
            }
            onError(error); 
        }
    }
    
    startTranslation.addEventListener('click', async () => {
        if (isTranslating) return;
        if (!apiKeyInput.value) {
            showError("لطفاً ابتدا کلید API خود را در تنظیمات وارد کنید.");
            return;
        }

        // [!!!] بازنشانی وضعیت توقف [!!!]
        userManuallyAborted = false; 
        abortController = new AbortController(); 
        
        isTranslating = true;
        startTranslation.style.display = 'none';
        stopTranslation.style.display = 'block';
        downloadFiles.disabled = true;
        clearFileList.style.display = 'none'; 
        processedFiles = [];
        statusLog.innerHTML = '';
        statusLog.style.display = 'block';
        overallProgressSection.style.display = 'block';
        translationStatusMessage.classList.add('hidden');
        translationStatusMessage.className = 'status-message hidden';
        liveOutput.textContent = ''; 
        liveOutput.style.display = 'none'; 
        
        let fps = parseFloat(fpsInput.value);
        if (isNaN(fps) || fps <= 0) {
            fps = 23.976;
            addLog('FPS نامعتبر یا خالی بود. از مقدار پیش‌فرض 23.976 استفاده شد.', false, 'yellow');
        }
        
        const totalFiles = uploadedFiles.length;
        addLog("شروع عملیات ترجمه...");

        // --- Helper Function for separate translation calls with RETRY LOGIC ---
        async function translateChunk(content, customPrompt, fileName, progressStart, progressEnd, fileIndex) {
            if (!content.trim()) return '';
            updateFileStatus(fileIndex, `در حال آپلود (${fileName})...`, progressStart);
            
            const apiKey = apiKeyInput.value.trim();
            const model = modelSelect.value;
            const systemInstruction = systemPrompt.value; // پرامپت اصلی

            const fileUri = await uploadFileToGemini(
                content, fileName, apiKey,
                (p) => updateFileStatus(fileIndex, `در حال آپلود... ${Math.round(p)}%`, progressStart + (p * 0.05)), // 5% of range
                abortController.signal
            );
            
            updateFileStatus(fileIndex, "هوش مصنوعی درحال تفکر است...", progressStart + 5);
            liveOutput.textContent = 'هوش مصنوعی درحال تفکر است...'; 
            liveOutput.style.display = 'block'; 
            liveOutput.style.direction = 'rtl';
            liveOutput.style.textAlign = 'right';
            
            const thinkingStartTime = Date.now();
            const baseThinkingText = 'هوش مصنوعی درحال تفکر است... ';
            let thinkingTimer = setInterval(() => {
                const elapsedTime = ((Date.now() - thinkingStartTime) / 1000).toFixed(1);
                updateFileStatus(fileIndex, baseThinkingText + `${elapsedTime} ثانیه`, progressStart + 5);
            }, 100);
            
            const modelContents = [
                { parts: [ { text: customPrompt } ] }, // دستورالعمل سفارشی
                { parts: [ { fileData: { mime_type: "text/plain", file_uri: fileUri } } ] } // فایل
            ];

            // [!!!] حلقه تلاش مجدد (Retry Loop) برای ترجمه اصلی [!!!]
            const MAX_ATTEMPTS = 3; 
            const RETRY_DELAY = 10000; // 10 ثانیه

            for (let attempt = 1; attempt <= MAX_ATTEMPTS + 1; attempt++) {
                if (abortController.signal.aborted) throw new Error("عملیات لغو شد");
                
                try {
                    const translatedText = await new Promise((resolve, reject) => {
                        let isFirstChunk = true;
                        
                        const TIMEOUT_DURATION = 250 * 1000; // 250 seconds
                        const timeoutController = new AbortController();
                        const timeoutId = setTimeout(() => {
                            timeoutController.abort(new Error(`ترجمه بیش از ${TIMEOUT_DURATION / 1000} ثانیه طول کشید (Timeout).`));
                        }, TIMEOUT_DURATION);
                        
                        const onMainAbort = () => {
                            timeoutController.abort(new Error("عملیات لغو شد"));
                        };
                        abortController.signal.addEventListener('abort', onMainAbort, { once: true });


                        getTranslationStream(
                            systemInstruction, // پرامپت سیستم اصلی
                            modelContents,     // محتوا (شامل دستورالعمل و فایل)
                            (currentFullText) => { // onChunk
                                if (thinkingTimer) { clearInterval(thinkingTimer); thinkingTimer = null; }
                                if (isFirstChunk) { liveOutput.textContent = ''; isFirstChunk = false; }
                                const lines = currentFullText.split('\n');
                                liveOutput.textContent = lines.map(line => (line.match(/\{(\d+)\}\{(\d+)\}(.*)/) || [])[3] || '').join('\n').replace(/\|/g, '\n');
                                liveOutput.scrollTop = liveOutput.scrollHeight;
                                const percentage = (lines.length / (content.match(/\n/g) || []).length);
                                updateFileStatus(fileIndex, `در حال دریافت ترجمه... ${lines.length} خط`, progressStart + 5 + (percentage * (progressEnd - (progressStart + 5)) * 0.9)); // 90% of remaining range
                            },
                            (finalText) => { // onEnd
                                if (thinkingTimer) { clearInterval(thinkingTimer); thinkingTimer = null; }
                                clearTimeout(timeoutId); 
                                abortController.signal.removeEventListener('abort', onMainAbort); 
                                resolve(finalText);
                            },
                            (error) => { // onError
                                if (thinkingTimer) { clearInterval(thinkingTimer); thinkingTimer = null; }
                                clearTimeout(timeoutId); 
                                abortController.signal.removeEventListener('abort', onMainAbort); 
                                reject(error); 
                            }, 
                            timeoutController.signal // Pass the new signal
                        );
                    });
                    return translatedText; // موفقیت آمیز

                } catch (error) {
                    if (abortController.signal.aborted) throw error;

                    const errorMessage = error.message.toLowerCase();

                    // [!!!] قانون: توقف فوری در صورت لیمیت [!!!]
                    if (errorMessage.includes('resource exhausted') || errorMessage.includes('quota exceeded')) {
                         throw new Error("LIMIT_REACHED: " + error.message);
                    }

                    const isRetryable = errorMessage.includes('overloaded') || 
                                      errorMessage.includes('503') || 
                                      errorMessage.includes('524') ||
                                      errorMessage.includes('networkerror');

                    if (isRetryable && attempt <= MAX_ATTEMPTS) {
                         addLog(`خطای شلوغی در ترجمه اصلی (تلاش ${attempt} از ${MAX_ATTEMPTS}). ${RETRY_DELAY/1000} ثانیه صبر می‌کنیم...`, false, "yellow");
                         updateFileStatus(fileIndex, `تلاش مجدد ${attempt}...`, progressStart);
                         await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
                         // تایمر تفکر دوباره فعال شود
                         if (!thinkingTimer) {
                             thinkingTimer = setInterval(() => {
                                const elapsedTime = ((Date.now() - thinkingStartTime) / 1000).toFixed(1);
                                updateFileStatus(fileIndex, baseThinkingText + `${elapsedTime} ثانیه`, progressStart + 5);
                            }, 100);
                         }
                    } else {
                        throw error; // لیمیت یا پایان تلاش‌ها
                    }
                }
            }
        }
        // --- End Helper Function ---


        for (let i = 0; i < totalFiles; i++) {
            const file = uploadedFiles[i];
            const apiKey = apiKeyInput.value.trim();
            const model = modelSelect.value;
            const prompt = systemPrompt.value;
            
            let originalDialogueBlocks = [];
            let originalLastEndFrame = 0;

            let useAssPath = false;
            let originalAssContentForFile = '';
            let assMapping = [];

            try {
                if (abortController.signal.aborted) throw new Error("عملیات لغو شد");
                
                addLog(`--- شروع پردازش فایل: ${file.name} ---`);
                updateFileStatus(i, "در حال خواندن و پارس کردن...", 0);
                const content = await file.text();

                const outputFormatRadio = document.querySelector('input[name="output-format"]:checked');
                const outputFormatChoice = outputFormatRadio ? outputFormatRadio.value : 'ass';
                useAssPath = file.name.endsWith('.ass') && outputFormatChoice === 'ass';

                if (useAssPath) {
                    addLog(`فایل ${file.name} به عنوان ASS (با حفظ استایل) پردازش می‌شود.`);
                    originalAssContentForFile = content; 
                    originalDialogueBlocks = parseASS(content);
                    const processResult = processAssForTranslationAndMapping(content, fps);
                    assMapping = processResult.map;
                } else {
                    if (file.name.endsWith('.srt')) {
                        originalDialogueBlocks = parseSRT(content);
                    } else if (file.name.endsWith('.ass')) {
                        addLog(`فایل ${file.name} به عنوان SRT (ساده) پردازش می‌شود.`);
                        const cleanSrt = cleanAssToSrt(content);
                        originalDialogueBlocks = parseSRT(cleanSrt); 
                    } else if (file.name.endsWith('.vtt')) {
                        originalDialogueBlocks = parseVTT(content);
                    }
                }

                if (originalDialogueBlocks.length === 0) throw new Error("هیچ دیالوگی برای ترجمه یافت نشد. (فایل خالی است یا تمام خطوط فیلتر شدند)");
                
                addLog(`تعداد ${originalDialogueBlocks.length} دیالوگ (پس از فیلتر شدن) یافت شد.`);
                originalLastEndFrame = timeToFrames(originalDialogueBlocks[originalDialogueBlocks.length-1].end, fps);

                // --- New Logic (Prompt 2): Split Dialogues and Romaji ---
                const dialogueData = originalDialogueBlocks.map((block, i) => {
                    const startFrame = timeToFrames(block.start, fps);
                    const endFrame = timeToFrames(block.end, fps);
                    // [!!!] اصلاح: حذف تگ‌های b و i از vtt [!!!]
                    const cleanText = block.text.replace(/\{[^}]+\}/g, ' ').replace(/<[^>]+>/g, ' ').replace(/[\r\n]+/g, ' ').trim();
                    const microLine = `{${startFrame}}{${endFrame}}${cleanText.replace(/\n/g, '|')}`;
                    return { i, microLine, cleanText, startFrame, endFrame, block };
                });

                const mainLines = dialogueData.filter(d => !isRomajiOrKanji(d.cleanText));
                const romajiLines = dialogueData.filter(d => isRomajiOrKanji(d.cleanText));

                const mainMicroDVD = mainLines.map(d => d.microLine).join('\n');
                const romajiMicroDVD = romajiLines.map(d => d.microLine).join('\n');
                
                addLog(`تفکیک شد: ${mainLines.length} خط دیالوگ اصلی، ${romajiLines.length} خط آهنگ/روماجی.`);
                
                const originalMicroDVDForMerge = dialogueData.map(d => d.microLine).join('\n');

                // --- New Logic (Prompt 2): Separate Translations ---
                const translatedMain = mainMicroDVD ? await translateChunk(mainMicroDVD, "این فایل فقط شامل دیالوگ‌های اصلی است. لطفاً آن‌ها را به فارسی روان و محاوره‌ای ترجمه کن.", `${file.name}-main`, 10, 45, i) : '';
                
                const romajiPrompt = `این فایل فقط شامل خطوط آهنگ (OP/ED) به زبان انگلیسی یا روماجی است. 
لطفاً به فارسی **روان، آهنگین، و شاعرانه** ترجمه کنید. 
**از ترجمه تحت‌اللفظی پرهیز کن.** حس و ریتم آهنگ را حفظ کن.`;
                const translatedRomaji = romajiMicroDVD ? await translateChunk(romajiMicroDVD, romajiPrompt, `${file.name}-romaji`, 45, 80, i) : '';

                addLog("ترجمه‌ها دریافت شد. در حال ادغام...");
                updateFileStatus(i, "در حال ادغام نتایج...", 80);

                // --- New Logic (Prompt 2): Smart Merging ---
                const mainTranslatedLines = translatedMain.split('\n').filter(l => l.trim());
                const romajiTranslatedLines = translatedRomaji.split('\n').filter(l => l.trim());

                let finalMicroDVDLines = new Array(originalDialogueBlocks.length).fill('');
                let mainLinesCounter = 0;
                let romajiLinesCounter = 0;

                mainLines.forEach((line) => {
                    finalMicroDVDLines[line.i] = mainTranslatedLines[mainLinesCounter] || line.microLine;
                    mainLinesCounter++;
                });

                romajiLines.forEach((line) => {
                    const trans = (romajiLinesCounter < romajiTranslatedLines.length) ? romajiTranslatedLines[romajiLinesCounter] : line.cleanText;
                    const timePart = `{${line.startFrame}}{${line.endFrame}}`;
                    finalMicroDVDLines[line.i] = `${timePart}${trans.replace(/\n/g, '|')}`;
                    romajiLinesCounter++;
                });
                
                if (romajiLines.length !== romajiLinesCounter || mainLines.length !== mainLinesCounter) {
                     addLog(`هشدار: عدم تطابق در ادغام خطوط. اصلی: ${originalDialogueBlocks.length}, ترجمه‌شده اصلی: ${mainTranslatedLines.length}, ترجمه‌شده روماجی: ${romajiTranslatedLines.length}`, false, "yellow");
                }

                const finalTranslatedMicroDVD = finalMicroDVDLines.filter(l => l).join('\n');
                // --- End New Logic ---
                
                const mergeResult = mergeTrustedFramesWithAiText(originalMicroDVDForMerge, finalTranslatedMicroDVD);
                let microDVDSplitted = mergeResult.mergedTextLines; 
                
                const isComplete = checkTranslationCompleteness(microDVDSplitted.join('\n'), originalLastEndFrame);
                if (!isComplete) addLog("هشدار: ترجمه ممکن است ناقص باشد (خط پایانی مطابقت ندارد).", false, "yellow");

                if (mergeResult.untranslatedCount > 0) {
                    addLog(`هشدار: ${mergeResult.untranslatedCount} خط در ترجمه اولیه جا افتاده بود.`, false, "yellow");
                    microDVDSplitted = await performMissingLineCorrection(
                        microDVDSplitted, 
                        mergeResult.untranslatedLinesData, 
                        i, 
                        model, 
                        apiKey, 
                        prompt
                    );
                }
                
                updateFileStatus(i, "در حال اصلاح ترجمه...", 85);
                microDVDSplitted = await performSelfCorrection(microDVDSplitted, i, model, apiKey, prompt); 
                
                const finalMicroDVDWithCorrections = microDVDSplitted.join('\n'); 
                
                updateFileStatus(i, "در حال ساخت فایل .ass...", 95);
                
                let finalAssContent;
                if (useAssPath) {
                    addLog(`بازسازی فایل ${file.name} با حفظ استایل...`);
                    const translationLookup = createTranslationLookupMap(finalMicroDVDWithCorrections);
                    const rebuildResult = rebuildAssFromTranslation(originalAssContentForFile, assMapping, translationLookup);
                    finalAssContent = rebuildResult.rebuiltAss;
                    
                    if (rebuildResult.untranslatedCount > 0) {
                        addLog(`هشدار: ${rebuildResult.untranslatedCount} خط در بازسازی ASS یافت نشد.`, false, "yellow");
                    }
                    if (rebuildResult.styleReplacementFailureCount > 0) {
                        addLog(`هشدار: ${rebuildResult.styleReplacementFailureCount} خطای بازسازی استایل پیچیده رخ داد.`, false, "yellow");
                    }
                } else {
                    const translatedMap = new Map();
                    const microDVDLineRegex = /^{(\d+)}{(\d+)}(.*)$/;
                    let lineIndex = 0;
                    for (const line of finalMicroDVDWithCorrections.split('\n')) {
                        const match = line.match(microDVDLineRegex);
                        if (match && lineIndex < originalDialogueBlocks.length) {
                            // Add RTL markers here for simple SRT/VTT path
                            let text = match[3];
                            text = text.split('|').map(part => `\u202B${part.trim()}\u202C`).join('\n');
                            translatedMap.set(lineIndex, text);
                            lineIndex++;
                        }
                    }
                    
                    const correctedTexts = originalDialogueBlocks.map((block, index) => 
                        translatedMap.get(index) || block.text 
                    );

                    finalAssContent = buildASS(originalDialogueBlocks, correctedTexts, file.name);
                }

                addLog(`در حال جاسازی فونت در فایل ${file.name}...`);
                const assWithFont = await finalizeAssFile(finalAssContent);

                processedFiles.push({
                    name: file.name.replace(/\.(srt|vtt|ass)$/i, '_FA.ass'),
                    content: assWithFont 
                });
                
                updateFileStatus(i, "کامل شد", 100);
                addLog(`--- پردازش فایل ${file.name} کامل شد. ---`);

            } catch (error) {
                // if (thinkingTimer) clearInterval(thinkingTimer); // thinkingTimer is local to translateChunk
                liveOutput.style.display = 'none'; 
                
                let userFriendlyMessage = '';
                const errorMessageText = error.message || 'خطایی نامشخص رخ داد.';

                // [!!!] منطق جدید مدیریت خطای توقف [!!!]
                if (userManuallyAborted && (error.name === 'AbortError' || errorMessageText.includes("لغو شد"))) {
                    // حالت ۱: کاربر دکمه توقف را زده است
                    userFriendlyMessage = '<p>عملیات ترجمه توسط کاربر متوقف شد.</p>';
                    translationStatusMessage.innerHTML = '❌ ترجمه توسط کاربر متوقف شد.';
                    translationStatusMessage.className = 'status-message status-aborted';

                 } else if (errorMessageText.includes("LIMIT_REACHED")) {
    // [!!!] حالت خاص لیمیت [!!!]
    userFriendlyMessage = `<p class="font-bold text-red-600">تعداد درخواست‌های شما بیش از حد مجاز است. لطفاً بعداً تلاش کنید.</p>`;
    translationStatusMessage.innerHTML = '❌ تعداد درخواست‌های شما بیش از حد مجاز است.';

                    translationStatusMessage.className = 'status-message status-aborted';
                    
                    showError(userFriendlyMessage, true); 
                    addLog(`خطای بحرانی لیمیت: ${errorMessageText}`, true);
                    updateFileStatus(i, "توقف (Limit)", -1);
                    break; // [!!!] شکستن حلقه اصلی فایل‌ها [!!!]

                } else if (error.name === 'AbortError' || errorMessageText.includes("لغو شد") || errorMessageText.includes("Timeout")) {
                    // حالت ۲: عملیات متوقف شده، اما نه توسط کاربر (مثلاً خروج از برنامه، تایم‌اوت، یا خطای شبکه)
                    userFriendlyMessage = `<p class="font-bold">عملیات متوقف شد (خطای مرورگر یا شبکه).</p><pre class="bg-gray-900 p-2 rounded mt-2 text-xs">${escapeHTML(errorMessageText)}</pre><p class="mt-2">مرورگر ممکن است عملیات را به دلیل رفتن به پس‌زمینه (خروج از برنامه) یا ناپایداری شبکه متوقف کرده باشد.</p><p class="font-bold mt-4">راه حل:</p><ol class="list-decimal list-inside pr-4 mt-2"><li>در حین ترجمه، برنامه را در پس‌زمینه نبرید.</li><li>دوباره تلاش کنید.</li></ol>`;
                    translationStatusMessage.innerHTML = '⚠️ عملیات متوقف شد (خطای مرورگر).';
                    translationStatusMessage.className = 'status-message status-incomplete'; // تغییر به زرد

                } else if (errorMessageText.toLowerCase().includes('location') || errorMessageText.toLowerCase().includes('permission denied')) {
                    userFriendlyMessage = `<p class="font-bold">خطا در دسترسی (مشکل تحریم یا فیلترشکن).</p><pre class="bg-gray-900 p-2 rounded mt-2 text-xs">${escapeHTML(errorMessageText)}</pre><p class="mt-2">سرور گوگل به دلیل موقعیت جغرافیایی شما اجازه دسترسی نمی‌دهد.</p><p class="font-bold mt-4">راه حل:</p><ol class="list-decimal list-inside pr-4 mt-2"><li>گزینه "استفاده از پراکسی" را در تنظیمات فعال کنید.</li><li>یا، از یک فیلترشکن قوی استفاده کنید.</li></ol>`;
                    translationStatusMessage.innerHTML = '❌ خطای دسترسی/فیلترشکن.';
                    translationStatusMessage.className = 'status-message status-aborted';
                } else if (errorMessageText.toLowerCase().includes('networkerror') || errorMessageText.includes('522') || errorMessageText.includes('524')) {
                    userFriendlyMessage = `<p class="font-bold">خطای شبکه (NetworkError یا خطای پراکسی).</p><pre class="bg-gray-900 p-2 rounded mt-2 text-xs">${escapeHTML(errorMessageText)}</Epre><p class="mt-2">اتصال به سرور (یا پراکسی) ناپایدار است یا قطع شده.</p><p class="font-bold mt-4">راه حل:</p><ol class="list-decimal list-inside pr-4 mt-2"><li>از پایداری اینترنت خود مطمئن شوید.</li><li>اگر از پراکسی استفاده نمی‌کنید، فیلترشکن را بررسی کنید.</li><li>اگر از پراکسی استفاده می‌کنید، اتصال اینترنت خود را بررسی کنید.</li></ol>`;
                    translationStatusMessage.innerHTML = '❌ خطای شبکه.';
                    translationStatusMessage.className = 'status-message status-aborted';
                } else if (errorMessageText.toLowerCase().includes('api key not valid')) {
                    userFriendlyMessage = `<p class="font-bold">کلید API نامعتبر است.</p><pre class="bg-gray-900 p-2 rounded mt-2 text-xs">${escapeHTML(errorMessageText)}</pre><p class="mt-2">کلید وارد شده صحیح نیست یا منقضی شده است.</p>`;
                    translationStatusMessage.innerHTML = '❌ کلید API نامعتبر.';
                    translationStatusMessage.className = 'status-message status-aborted';
                
                } else if (errorMessageText.toLowerCase().includes('overloaded') || errorMessageText.toLowerCase().includes('503')) {
                    userFriendlyMessage = `<p class="font-bold">مدل بیش از حد شلوغ است.</p><p class="mt-2">با وجود تلاش‌های مکرر، سرور پاسخگو نبود.</p>`;
                    translationStatusMessage.innerHTML = '⚠️ مدل شلوغ است.';
                    translationStatusMessage.className = 'status-message status-incomplete';
                } else {
                    userFriendlyMessage = `<b>یک خطای پیش‌بینی‌نشده رخ داد:</b><pre class="bg-gray-900 p-2 rounded mt-2 text-xs">${escapeHTML(errorMessageText)}</pre>`;
                    translationStatusMessage.innerHTML = '❌ خطایی در ترجمه رخ داد.';
                    translationStatusMessage.className = 'status-message status-aborted';
                }
                
                showError(userFriendlyMessage, true); 
                const errorMsg = `خطا در پردازش فایل ${file.name}: ${error.message}`;
                addLog(errorMsg, true);
                updateFileStatus(i, "خطا", -1); 
                console.error(error);
                
                // [!!!] اصلاح شده: فقط اگر کاربر خودش توقف نکرده، پیام توقف در لاگ نمایش داده شود [!!!]
                if (!userManuallyAborted && (error.name !== 'AbortError' && !error.message.includes("لغو شد"))) {
                    addLog("عملیات به دلیل خطا متوقف شد.", true);
                }
                break; 
            }
        } // end for loop

        isTranslating = false;
        startTranslation.style.display = 'block';
        stopTranslation.style.display = 'none';
        if (uploadedFiles.length > 0) { 
             clearFileList.style.display = 'block';
        }
        
        if (processedFiles.length > 0) {
            downloadFiles.disabled = false;
            addLog("عملیات کامل شد. می‌توانید فایل‌ها را دانلود کنید.", false, "green");
            if (!translationStatusMessage.classList.contains('status-aborted') && !translationStatusMessage.classList.contains('status-incomplete')) {
                 translationStatusMessage.innerHTML = `✔️ عملیات با موفقیت کامل شد. (${processedFiles.length} فایل آماده دانلود)`;
                 translationStatusMessage.className = 'status-message status-complete';
            }
        } else {
            if (!translationStatusMessage.classList.contains('status-aborted') && !translationStatusMessage.classList.contains('status-incomplete')) {
                addLog("هیچ فایلی با موفقیت پردازش نشد.", true);
                translationStatusMessage.innerHTML = '⚠️ عملیات کامل شد، اما هیچ فایلی پردازش نشد.';
                translationStatusMessage.className = 'status-message status-incomplete';
            }
        }
        translationStatusMessage.classList.remove('hidden');
        
        const filesDone = processedFiles.length;
        overallProgressBar.style.width = `${(filesDone / totalFiles) * 100}%`;
        overallProgressLabel.textContent = `عملیات کامل شد. ${filesDone} از ${totalFiles} فایل پردازش شد.`;

    });
    
    stopTranslation.addEventListener('click', () => {
        if (abortController) {
            // [!!!] تنظیم فلگ قبل از توقف [!!!]
            userManuallyAborted = true; 
            addLog("درخواست توقف عملیات...", false, "yellow");
            abortController.abort();
        }
    });

    // --- 9. ساخت فایل .ASS و دانلود (اصلاح شده) ---

    function buildASS(originalBlocks, translatedTexts, originalFileName) {
        const header = `
[Script Info]
Title: ${originalFileName.replace(/\.(srt|vtt|ass)$/i, '')}_FA_Translated
ScriptType: v4.00+
WrapStyle: 0
PlayResX: 1920
PlayResY: 1080
ScaledBorderAndShadow: yes
[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Vazirmatn Medium,55,&H00FFFFFF,&H0000FFFF,&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1R,2,1,2,30,30,30,1
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
        `.trim();

        let events = [];
        let lastEndTime = "0:00:00.00";

        for (let i = 0; i < originalBlocks.length; i++) {
            const block = originalBlocks[i];
            const translatedText = translatedTexts[i] || ""; 
            let positionOverride = "";
            
            let assText = translatedText.replace(/\r?\n/g, '\\N');

            if (compareTimestamps(block.start, lastEndTime) < 0 && !assText.includes('\\an') && !assText.includes('\\pos')) {
                positionOverride = "{\\an8}"; 
            }
            lastEndTime = block.end;
            
            const layer = block.layer || '0';
            const style = block.style || 'Default';
            const name = block.name || '';
            const marginL = block.marginL || '0';
            const marginR = block.marginR || '0';
            const marginV = block.marginV || '0';
            const effect = block.effect || '';
            
            // [!!!] اصلاح: حذف تگ‌های VTT که ممکن است باقی مانده باشند [!!!]
            const originalRawText = block.text.replace(/<[^>]+>/g, '');

            if (originalRawText && (originalRawText.includes('{') || originalRawText.includes('}'))) {
                const originalTextOnly = originalRawText.replace(/\{[^}]+\}/g, ' ').replace(/<[^>]+>/g, ' ');
                
                if (originalTextOnly.trim()) {
                    assText = originalRawText.replace(originalTextOnly, assText);
                } else {
                    assText = originalRawText + assText;
                }
            }
            
            if (positionOverride) {
                if (assText.startsWith('{') && assText.includes('}')) {
                    assText = `{\\an8${assText.substring(1)}`;
                } else {
                    assText = `{\\an8}${assText}`;
                }
            }

            events.push(
                `Dialogue: ${layer},${block.start},${block.end},${style},${name},${marginL},${marginR},${marginV},${effect},${assText}`
            );
        }
        return header + '\n' + events.join('\n');
    }
    
    function compareTimestamps(t1, t2) {
        const timeToSeconds = (t) => {
            const ms = parseTimeToMS(t);
            return ms / 1000;
        };
        return timeToSeconds(t1) - timeToSeconds(t2);
    }
    
    downloadFiles.addEventListener('click', () => {
        if (processedFiles.length === 0) return;

        for (const file of processedFiles) {
            downloadSingleFile(file.name, file.content);
        }
    });
    
    function downloadSingleFile(filename, content) {
        const blob = new Blob(['\uFEFF' + content], { type: 'application/octet-stream' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
    
    // --- 10. توابع کمکی UI (لاگ و خطا) ---
    
    function addLog(message, isError = false, color = "gray") {
        const logEntry = document.createElement('p');
        if (isError) logEntry.className = 'text-red-400';
        else if (color === 'green') logEntry.className = 'text-green-400';
        else if (color === 'yellow') logEntry.className = 'text-yellow-400';
        else logEntry.className = 'text-gray-300';
        logEntry.textContent = `[${new Date().toLocaleTimeString()}] ${escapeHTML(message)}`;
        statusLog.appendChild(logEntry);
        statusLog.scrollTop = statusLog.scrollHeight;
    }
    
    function showError(message, isHtml = false) {
        if (isHtml) {
            errorMessageContainer.innerHTML = message;
        } else {
            errorMessageContainer.textContent = message;
        }
        errorModal.style.display = 'flex';
    }
    
    closeModal.addEventListener('click', () => {
        errorModal.style.display = 'none';
    });

    // --- اجرای اولیه ---
    loadSettings();

    const detailsToggle = document.querySelector('.safety-settings-details summary');
    if (detailsToggle) {
        detailsToggle.addEventListener('click', () => {
            const isExpanded = detailsToggle.getAttribute('aria-expanded') === 'true';
            detailsToggle.setAttribute('aria-expanded', !isExpanded);
        });
    }
    
}); // ** END: پایان DOMContentLoaded **
