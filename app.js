document.addEventListener('DOMContentLoaded', () => {

    // --- 0. توابع کمکی (جدید: ماسک کردن تگ‌ها و مدیریت پرامپت) ---

    // --- [NEW] Storage Manager Functions for Resume Capability ---
    const STORAGE_KEY_PREFIX = 'anime_sub_resume_data_';

    function getFileId(file) {
        // Unique ID based on name and size to avoid conflicts
        return `${file.name}_${file.size}`;
    }

    function saveProgress(fileId, map) {
        try {
            // Convert Map to Array of entries for JSON serialization
            const obj = Array.from(map.entries());
            localStorage.setItem(STORAGE_KEY_PREFIX + fileId, JSON.stringify(obj));
        } catch (e) {
            console.error("Failed to save progress to LocalStorage:", e);
        }
    }

    function loadProgress(fileId) {
        try {
            const saved = localStorage.getItem(STORAGE_KEY_PREFIX + fileId);
            if (saved) {
                // Convert JSON back to Map
                return new Map(JSON.parse(saved));
            }
        } catch (e) {
            console.error("Failed to load progress:", e);
        }
        return new Map();
    }

    function clearProgress(fileId) {
        try {
            localStorage.removeItem(STORAGE_KEY_PREFIX + fileId);
        } catch (e) {
            console.error("Failed to clear progress:", e);
        }
    }
    // -----------------------------------------------------------

    // تابع ماسک کردن: تگ‌های داخل {} را با پلیس‌هولدر ___TAG_n___ جایگزین می‌کند
    function maskTags(text) {
        const tags = [];
        let maskedText = text.replace(/\{[^}]*?\}/g, (match) => {
            tags.push(match);
            return `___TAG_${tags.length - 1}___`;
        });
        return { maskedText, tags };
    }

                         function unmaskTags(text, tags) {
        // اگر تگی وجود نداشت، همان متن خالص را برگردان
        if (!tags || tags.length === 0) {
            return text;
        }

        // تمام تگ‌های ذخیره شده برای این کلمه را به هم می‌چسبانیم
        let allTags = tags.join('');
        
        // ادغام هوشمندانه تگ‌های متوالی برای تمیزی و جلوگیری از خطای پلیر 
        // مثلا تبدیل: {\pos(x,y)}{\c&HFFFFFF&} به {\pos(x,y)\c&HFFFFFF&}
        allTags = allTags.replace(/\}\{/g, '\\');

        // در فرمت ASS، هم تگ‌های سیستمی (مثل pos) و هم استایل (رنگ) 
        // باید حتماً در ابتدای رشته قرار بگیرند تا روی کلمه اعمال شوند
        return allTags + text;
    }

    // [!!!] تابع جدید برای تمیزکاری خروجی AI (حذف بک‌تیک‌های مارک‌داون) [!!!]
    function cleanAIOutput(text) {
        if (!text) return "";
        // حذف بلوک‌های کد شروع (مثلاً ```, ```text, ```json) و پایان
        // این کار باعث می‌شود اگر AI متن را در کدبلاک گذاشت، خط اول خراب نشود
        return text.replace(/^```[a-zA-Z]*\n?/g, '').replace(/\n?```$/g, '').trim();
    }

    function escapeHTML(str) {
        if (typeof str !== 'string') return str;
        return str.replace(/[&<>"']/g, m => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'}[m]));
    }

    function isRomajiOrKanji(text) {
        if (!text) return false;
        // [!!!] اگر متن حاوی پلیس‌هولدر تگ باشد، آن را نادیده می‌گیریم تا باعث تشخیص اشتباه نشود [!!!]
        const cleanText = text.replace(/___TAG_\d+___/g, '').replace(/\{[^}]+\}/g, ' ').trim();

        const allowedCharsRegex = /^[a-zA-Z\s\.,!\?'"\-\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF♪\(\)\*…♡:\/]+$/;

        if (!allowedCharsRegex.test(cleanText)) {
            return false; 
        }

        const hiragana = /[\u3040-\u309F]/;
        const katakana = /[\u30A0-\u30FF]/;
        const kanji = /[\u4E00-\u9FFF]/;
        const hasJapanese = hiragana.test(cleanText) || katakana.test(cleanText) || kanji.test(cleanText);

        if (hasJapanese) return true; 

        const songMarkerRegex = /[♪♡]/; 
        if (songMarkerRegex.test(cleanText)) return true;

        return false;
    }


    // --- 1. انتخاب عناصر HTML ---
    const apiKeyInput = document.getElementById('apiKey');
    const apiKeyLockIcon = document.getElementById('apiKeyLockIcon'); // آیکون قفل جدید
    const modelSelect = document.getElementById('modelSelect');
    const fpsInput = document.getElementById('fpsInput');

    // عناصر جدید: خلاقیت و لحن و Top-P
    const creativityRange = document.getElementById('creativityRange');
    const creativityValue = document.getElementById('creativityValue');
    const topPRange = document.getElementById('topPRange'); // اسلایدر جدید Top-P
    const topPValue = document.getElementById('topPValue'); // نمایش مقدار Top-P
    const toneSelect = document.getElementById('toneSelect');
        // عناصر جدید: واترمارک و متن‌های شروع/پایان
    const startTextEnabled = document.getElementById('startTextEnabled');
    const startTextInput = document.getElementById('startTextInput');
    const startTextStartTime = document.getElementById('startTextStartTime');
    const startTextEndTime = document.getElementById('startTextEndTime');
    const endTextEnabled = document.getElementById('endTextEnabled');
    const endTextInput = document.getElementById('endTextInput');
    const endTextStartFromEnd = document.getElementById('endTextStartFromEnd');
    const endTextDuration = document.getElementById('endTextDuration');

    // دکمه‌های راهنما
    const helpButtons = document.querySelectorAll('.help-btn');

    // عناصر مربوط به پرامپت
    const systemPrompt = document.getElementById('systemPrompt');
    const promptSelector = document.getElementById('promptSelector');
    const addPromptBtn = document.getElementById('addPromptBtn');
    const deletePromptBtn = document.getElementById('deletePromptBtn');
    const promptReadOnlyMsg = document.getElementById('promptReadOnlyMsg');

    const resetSettings = document.getElementById('resetSettings'); 
    const settingsReset = document.getElementById('settingsReset'); 

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
    const karaokeToggle = document.getElementById('karaoke-toggle'); // [!!!] دکمه جدید کارائوکه
    const aiDetectionToggle = document.getElementById('ai-detection-toggle'); // [!!!] دکمه جدید تشخیص هوشمند
    const liveOutputToggle = document.getElementById('live-output-toggle'); // [!!!] دکمه جدید نمایش زنده
    const thinkingModeToggle = document.getElementById('thinking-mode-toggle');

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
    let userManuallyAborted = false;
    let saveProgressTimeout = null; // [!!!] تایمر برای Debounce ذخیره

    let assFormatFields = ['Layer', 'Start', 'End', 'Style', 'Name', 'MarginL', 'MarginR', 'MarginV', 'Effect', 'Text'];
    let styleFormatFields = ['Name', 'Fontname', 'Fontsize', 'PrimaryColour', 'SecondaryColour', 'OutlineColour', 'BackColour', 'Bold', 'Italic', 'Underline', 'StrikeOut', 'ScaleX', 'ScaleY', 'Spacing', 'Angle', 'BorderStyle', 'Outline', 'Shadow', 'Alignment', 'MarginL', 'MarginR', 'MarginV', 'Encoding'];

    const drawingCommandRegex = /^\s*(m|l|b|s|p|c)\s/i; 

    // [!!!] پرامپت جدید با تمرکز بر ضمایر و دقت ترجمه [!!!]
    // [UPDATE: Added strict anti-hallucination rules at the end]
    const defaultPromptText = `
پرامپت پیشرفته و یکپارچه برای ترجمه حرفه‌ای زیرنویس انیمه (فرمت 'میکرو دی وی دی')

مأموریت شما:
شما یک مترجم ارشد انیمه هستید. وظیفه شما ترجمه دیالوگ‌ها به "فارسی روان، محاوره‌ای و طبیعی" است. مخاطب نباید حس کند ترجمه می‌خواند.

---

قوانین حیاتی و خط قرمزها (برای جلوگیری از باگ‌های معنایی):

1. **تشخیص دقیق فاعل و مفعول (بسیار مهم):**
   - در جملات انگلیسی، دقت کن چه کسی کار را انجام می‌دهد و چه کسی دریافت می‌کند.
   - مثال خطا: "I'm counting on you" نباید بشود "روم حساب می‌کنی".
   - مثال صحیح: "I'm counting on you" باید بشود "روت حساب می‌کنم" یا "چشم امیدم به توئه".
   - اگر در جمله انگلیسی ضمیر حذف شده (مثلاً "Counting on you")، با توجه به اینکه گوینده چه کسی است، فاعل درست را جایگذاری کن.

2. **حفظ لحن شخصیت:**
   - اگر کاراکتر مؤدب است (Senpai/Boss)، لحن کمی محترمانه باشد.
   - اگر کاراکتر صمیمی است، کاملاً شکسته و دوستانه ترجمه کن.

3. **ترجمه اصطلاحات:**
   - اصطلاحات را تحت‌اللفظی ترجمه نکن. معادل فارسی آن را پیدا کن.
   - مثال: "No way" -> "عمراً" یا "امکان نداره" (نه "هیچ راهی نیست").

4. **فرمت خروجی:**
   - فقط و فقط متن ترجمه شده را در قالب فرمت ورودی بازگردان.
   - تگ‌های ___TAG_n___ را دقیقاً سر جای خود حفظ کن.

---

فرایند فکری:
قبل از نوشتن ترجمه نهایی، در ذهن خود بررسی کن: "آیا این جمله در دهان یک فارسی‌زبان در این موقعیت طبیعی می‌چرخد؟" و "آیا فاعل و مفعول را برعکس متوجه نشده‌ام؟"

قوانین حیاتی و غیرقابل نقض:
۱. در متن ورودی کدهایی شبیه به ***TAG_0*** وجود دارد. به هیچ وجه آن‌ها را ترجمه نکن، فرمتشان را تغییر نده و دقیقاً کنار معادل فارسی کلمه‌شان قرار بده.
۲. توهم تگ: فقط و فقط از تگ‌هایی که در خط ورودی می‌بینی استفاده کن. به هیچ وجه تگ جدیدی (مثل TAG_99) از خودت اختراع نکن و تگ‌های خطوط دیگر را با هم قاطی نکن.
۳. عدم تکرار: جملات ترجمه شده را به هیچ وجه دو بار یا بیشتر تکرار نکن (DO NOT duplicate or repeat the translated sentences). هر خط را فقط یک بار ترجمه کن.
۴. در متن ورودی عباراتی داخل کروشه [...] وجود دارند که نشان‌دهنده نام گوینده یا افکت‌های صوتی هستند (مثل [gasps] یا [Kyoichiro]). این عبارات را به هیچ‌وجه ترجمه نکن و به طور کامل از متن خروجی حذفشان کن.
    `.trim();

    // مدیریت پرامپت‌ها
    let customPrompts = []; 
    let currentPromptId = 'default';

    // --- مدیریت UI و اعتبارسنجی API ---

    // تابع آپدیت رنگ پس‌زمینه اسلایدر
    function updateSliderBackground(slider) {
        const min = parseFloat(slider.min);
        const max = parseFloat(slider.max);
        const val = parseFloat(slider.value);
        const percentage = ((val - min) / (max - min)) * 100;
        slider.style.background = `linear-gradient(to left, #374151 calc(100% - ${percentage}%), #3b82f6 calc(100% - ${percentage}%))`;
    }

    // آپدیت لیبل و استایل اسلایدر خلاقیت
    creativityRange.addEventListener('input', (e) => {
        creativityValue.textContent = e.target.value;
        updateSliderBackground(e.target);
    });

    // آپدیت لیبل و استایل اسلایدر Top-P
    topPRange.addEventListener('input', (e) => {
        topPValue.textContent = e.target.value;
        updateSliderBackground(e.target);
    });

    // تابع کمکی برای آپدیت آیکون قفل
    function updateApiKeyLock(key) {
        const isValid = /^AIza[0-9A-Za-z-_]{35}$/.test(key.trim());
        if (isValid) {
            apiKeyLockIcon.classList.remove('text-red-500');
            apiKeyLockIcon.classList.add('text-green-500');
        } else {
            apiKeyLockIcon.classList.remove('text-green-500');
            apiKeyLockIcon.classList.add('text-red-500');
        }
    }

    // اعتبارسنجی کلید API و تغییر رنگ قفل
    apiKeyInput.addEventListener('input', (e) => {
        updateApiKeyLock(e.target.value);
    });

    // مدیریت دکمه‌های راهنما (تولتیپ)
    helpButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation(); // جلوگیری از بستن فوری
            const targetId = btn.getAttribute('data-target');
            const tooltip = document.getElementById(targetId);

            // بستن همه تولتیپ‌های دیگر
            document.querySelectorAll('.help-tooltip').forEach(t => {
                if (t !== tooltip) t.classList.remove('show');
            });

            tooltip.classList.toggle('show');
        });
    });

    // بستن تولتیپ‌ها با کلیک در جای دیگر صفحه
    document.addEventListener('click', () => {
        document.querySelectorAll('.help-tooltip').forEach(t => {
            t.classList.remove('show');
        });
    });

    function loadSettings() {
        // [!!!] ترتیب لود کردن مهم است: ابتدا متغیرهای داده‌ای، سپس UI [!!!]
        // اگر اول UI ست شود و رویداد input تریگر شود، autoSave با آرایه خالی اجرا شده و دیتا می‌پرد.

        // 1. بارگذاری داده‌های پرامپت از حافظه
        try {
            const savedPrompts = localStorage.getItem('customPrompts');
            customPrompts = savedPrompts ? JSON.parse(savedPrompts) : [];
        } catch (e) {
            customPrompts = [];
        }

        currentPromptId = localStorage.getItem('selectedPromptId') || 'default';

        // اگر پرامپت انتخابی حذف شده بود، برگرد به دیفالت
        if (currentPromptId !== 'default' && !customPrompts.find(p => p.id === currentPromptId)) {
            currentPromptId = 'default';
        }

        // 2. تنظیم مقادیر UI
        const key = localStorage.getItem('geminiApiKey') || '';
        apiKeyInput.value = key;
        updateApiKeyLock(key); // آپدیت آیکون بدون تریگر کردن رویداد input

        modelSelect.value = localStorage.getItem('geminiModel') || 'gemini-2.5-pro';
        fpsInput.value = localStorage.getItem('subtitleFPS') || '23.976';
        proxyToggle.checked = localStorage.getItem('proxyEnabled') === 'true';
        karaokeToggle.checked = localStorage.getItem('karaokeEnabled') !== 'false'; // پیش‌فرض true
        aiDetectionToggle.checked = localStorage.getItem('aiDetectionEnabled') === 'true'; // پیش‌فرض false
        liveOutputToggle.checked = localStorage.getItem('liveOutputEnabled') !== 'false'; // پیش‌فرض true
        if (thinkingModeToggle) thinkingModeToggle.checked = localStorage.getItem('thinkingModeEnabled') === 'true';

        // [!!!] تغییر پیش‌فرض دما به 0.2 برای دقت بیشتر [!!!]
        creativityRange.value = localStorage.getItem('geminiTemperature') || '0.2';
        creativityValue.textContent = creativityRange.value;
        updateSliderBackground(creativityRange);

        topPRange.value = localStorage.getItem('geminiTopP') || '0.9';
        topPValue.textContent = topPRange.value;
        updateSliderBackground(topPRange);

        toneSelect.value = localStorage.getItem('geminiTone') || 'informal';
        startTextEnabled.checked = localStorage.getItem('startTextEnabled') === 'true';
        if (localStorage.getItem('startTextInput')) startTextInput.value = localStorage.getItem('startTextInput');
        if (localStorage.getItem('startTextStartTime')) startTextStartTime.value = localStorage.getItem('startTextStartTime');
        if (localStorage.getItem('startTextEndTime')) startTextEndTime.value = localStorage.getItem('startTextEndTime');

        endTextEnabled.checked = localStorage.getItem('endTextEnabled') === 'true';
        if (localStorage.getItem('endTextInput')) endTextInput.value = localStorage.getItem('endTextInput');
        if (localStorage.getItem('endTextStartFromEnd')) endTextStartFromEnd.value = localStorage.getItem('endTextStartFromEnd');
        if (localStorage.getItem('endTextDuration')) endTextDuration.value = localStorage.getItem('endTextDuration');

        updatePromptUI();

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

    function updatePromptUI() {
        promptSelector.innerHTML = '';

        // گزینه دیفالت
        const defaultOpt = document.createElement('option');
        defaultOpt.value = 'default';
        defaultOpt.textContent = 'پرامت پیش فرض';
        promptSelector.appendChild(defaultOpt);

        // گزینه‌های سفارشی
        customPrompts.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = p.name;
            promptSelector.appendChild(opt);
        });

        promptSelector.value = currentPromptId;

        if (currentPromptId === 'default') {
            systemPrompt.value = defaultPromptText;
            systemPrompt.readOnly = true;
            systemPrompt.disabled = true; // غیرفعال کامل تا ظاهر :disabled در CSS اعمال شود (مچ با تم لایت/دارک)
            deletePromptBtn.classList.add('hidden');
            promptReadOnlyMsg.classList.remove('hidden');
        } else {
            const prompt = customPrompts.find(p => p.id === currentPromptId);
            systemPrompt.value = prompt ? prompt.content : '';
            systemPrompt.readOnly = false;
            systemPrompt.disabled = false;
            deletePromptBtn.classList.remove('hidden');
            promptReadOnlyMsg.classList.add('hidden');
        }
    }

    // تابع کمکی برای همگام‌سازی محتوای تکست‌اریا با آبجکت پرامپت فعلی قبل از تغییر
    function syncCurrentPromptContent() {
        if (currentPromptId !== 'default') {
            const index = customPrompts.findIndex(p => p.id === currentPromptId);
            if (index !== -1) {
                customPrompts[index].content = systemPrompt.value;
            }
        }
    }

    promptSelector.addEventListener('change', (e) => {
        syncCurrentPromptContent(); // ذخیره محتوای قبلی قبل از تغییر
        currentPromptId = e.target.value;
        updatePromptUI();
        autoSaveSettings(); 
    });

    addPromptBtn.addEventListener('click', () => {
        const name = prompt("نام پرامپت جدید را وارد کنید:");
        if (name && name.trim()) {
            syncCurrentPromptContent(); // ذخیره محتوای فعلی قبل از ایجاد جدید

            const newId = 'custom_' + Date.now();
            customPrompts.push({
                id: newId,
                name: name.trim(),
                content: '' // شروع با صفحه خالی
            });
            currentPromptId = newId;
            updatePromptUI();
            systemPrompt.focus();
            autoSaveSettings(); 
        }
    });

    deletePromptBtn.addEventListener('click', () => {
        if (currentPromptId === 'default') return;
        if (confirm("آیا از حذف این پرامپت مطمئن هستید؟")) {
            customPrompts = customPrompts.filter(p => p.id !== currentPromptId);
            currentPromptId = 'default';
            updatePromptUI();
            autoSaveSettings(); 
        }
    });

    // --- [FIX] هایلایت کردن کادر (بوردر آبی) فرمت خروجی انتخاب‌شده ---
    // قبلاً وقتی کاربر روی SRT کلیک می‌کرد، رادیو درست تیک می‌خورد ولی بوردر آبی دور کادر
    // همچنان روی ASS می‌ماند چون هیچ منطقی برای سینک کردن ظاهر با انتخاب واقعی وجود نداشت.
    const outputFormatRadios = document.querySelectorAll('input[name="output-format"]');

    function syncOutputFormatHighlight() {
        outputFormatRadios.forEach(radio => {
            const labelEl = radio.closest('label');
            if (!labelEl) return;
            if (radio.checked) {
                labelEl.classList.remove('border-slate-200', 'dark:border-slate-700', 'hover:border-slate-300', 'dark:hover:border-slate-600');
                labelEl.classList.add('border-blue-400', 'dark:border-blue-600');
            } else {
                labelEl.classList.remove('border-blue-400', 'dark:border-blue-600');
                labelEl.classList.add('border-slate-200', 'dark:border-slate-700', 'hover:border-slate-300', 'dark:hover:border-slate-600');
            }
        });
    }

    outputFormatRadios.forEach(radio => {
        radio.addEventListener('change', syncOutputFormatHighlight);
    });

    // اعمال وضعیت اولیه (هماهنگ با مقداری که از قبل checked هست، مثلاً بعد از بازگردانی پیش‌فرض‌ها)
    syncOutputFormatHighlight();

    function saveSafetySettings() {
        const settings = {
            harassment: safetyHarassmentToggle.checked,
            hateSpeech: safetyHateSpeechToggle.checked,
            sexuallyExplicit: safetySexuallyExplicitToggle.checked,
            dangerousContent: safetyDangerousContentToggle.checked
        };
        localStorage.setItem('safetySettings', JSON.stringify(settings));
    }

    // Auto-save logic
    function autoSaveSettings() {
        localStorage.setItem('geminiApiKey', apiKeyInput.value);
        localStorage.setItem('geminiModel', modelSelect.value);
        localStorage.setItem('subtitleFPS', fpsInput.value);
        localStorage.setItem('proxyEnabled', proxyToggle.checked);
        localStorage.setItem('karaokeEnabled', karaokeToggle.checked);
        localStorage.setItem('aiDetectionEnabled', aiDetectionToggle.checked);
        localStorage.setItem('liveOutputEnabled', liveOutputToggle.checked);
        if (thinkingModeToggle) localStorage.setItem('thinkingModeEnabled', thinkingModeToggle.checked);

        // ذخیره تنظیمات جدید
        localStorage.setItem('geminiTemperature', creativityRange.value);
        localStorage.setItem('geminiTopP', topPRange.value);
        localStorage.setItem('geminiTone', toneSelect.value);
        localStorage.setItem('startTextEnabled', startTextEnabled.checked);
        localStorage.setItem('startTextInput', startTextInput.value);
        localStorage.setItem('startTextStartTime', startTextStartTime.value);
        localStorage.setItem('startTextEndTime', startTextEndTime.value);

        localStorage.setItem('endTextEnabled', endTextEnabled.checked);
        localStorage.setItem('endTextInput', endTextInput.value);
        localStorage.setItem('endTextStartFromEnd', endTextStartFromEnd.value);
        localStorage.setItem('endTextDuration', endTextDuration.value);

        // ذخیره وضعیت پرامپت‌ها (با سینک کردن مجدد برای اطمینان)
        syncCurrentPromptContent();

        localStorage.setItem('customPrompts', JSON.stringify(customPrompts));
        localStorage.setItem('selectedPromptId', currentPromptId);

        saveSafetySettings();
    }

      // Attach auto-save listeners to all relevant inputs
    [apiKeyInput, modelSelect, fpsInput, 
     creativityRange, topPRange, toneSelect, 
     proxyToggle, karaokeToggle, aiDetectionToggle, liveOutputToggle, thinkingModeToggle,
     safetyHarassmentToggle, safetyHateSpeechToggle, 
     safetySexuallyExplicitToggle, safetyDangerousContentToggle,
     systemPrompt,
     startTextEnabled, startTextInput, startTextStartTime, startTextEndTime,
     endTextEnabled, endTextInput, endTextStartFromEnd, endTextDuration
    ].forEach(input => {
        if (input) {
            input.addEventListener('change', autoSaveSettings);
            input.addEventListener('input', autoSaveSettings);
        }
    });

    resetSettings.addEventListener('click', () => {

        // 1. بازنشانی وضعیت پرامپت به دیفالت (بدون حذف کاستوم‌ها)
        currentPromptId = 'default';
        updatePromptUI();

        // 2. بازنشانی پراکسی و کارائوکه
        proxyToggle.checked = false; 
        karaokeToggle.checked = true;
        aiDetectionToggle.checked = false;
        liveOutputToggle.checked = true;
        if (thinkingModeToggle) thinkingModeToggle.checked = false;

        // 3. بازنشانی تنظیمات ایمنی
        safetyHarassmentToggle.checked = false;
        safetyHateSpeechToggle.checked = false;
        safetySexuallyExplicitToggle.checked = false;
        safetyDangerousContentToggle.checked = false;

        // 4. بازنشانی FPS
        fpsInput.value = '23.976'; 

        // 5. بازنشانی تنظیمات جدید
        creativityRange.value = '0.2'; // [!!!] Reset to 0.2 [!!!]
        creativityValue.textContent = '0.2';
        updateSliderBackground(creativityRange);

        topPRange.value = '0.9';
        topPValue.textContent = '0.9';
        updateSliderBackground(topPRange);

        toneSelect.value = 'informal';
        startTextEnabled.checked = false;
        startTextInput.value = "";
        startTextStartTime.value = "5";
        startTextEndTime.value = "15";

        endTextEnabled.checked = false;
        endTextInput.value = "";
        endTextStartFromEnd.value = "120";
        endTextDuration.value = "10";

        // Trigger auto-save to persist reset state
        autoSaveSettings();

        // 6. نمایش پیام تایید
        settingsReset.classList.remove('hidden');
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

        // [!!!] تغییر: اضافه کردن به صف به جای جایگزینی [!!!]
        if (newFiles.length === 0) return;

        uploadedFiles.push(...newFiles);

        if (uploadedFiles.length > 0) {
            updateFileListUI();
            clearFileList.style.display = 'block';

            // [!!!] تغییر: همیشه حق انتخاب فرمت داده شود [!!!]
            outputFormatSelector.style.display = 'block';

            if (!isTranslating) {
                startTranslation.disabled = false;
                downloadFiles.disabled = true;
                processedFiles = []; // اگر ترجمه در حال انجام نیست، لیست پردازش‌شده‌ها را پاک کن (شروع مجدد)
            }
            // اگر در حال ترجمه است، هیچ کاری با دکمه‌ها و لیست پردازش‌شده نکن، تا صف به درستی ادامه یابد
        }
    }

    function updateFileListUI() {
        // [!!!] تغییر: به جای پاک کردن کل لیست، فقط آیتم‌های جدید را اضافه کن [!!!]
        // این کار باعث می‌شود اگر فایلی در حال پردازش است، وضعیتش (پروگرس بار) ریست نشود
        uploadedFiles.forEach((file, index) => {
            const elementId = `file-${index}`;
            if (document.getElementById(elementId)) return; // اگر قبلاً وجود دارد، رد شو

            const fileElement = document.createElement('div');
            fileElement.id = elementId;
            fileElement.className = 'bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center justify-between transition-colors';
            // [!!!] FIX: added overflow-hidden to rounded-full container for aesthetic safety [!!!]
            fileElement.innerHTML = `
                <div class="flex-1 min-w-0">
                    <p class="text-sm font-bold text-slate-800 dark:text-white break-words leading-tight">${escapeHTML(file.name)}</p>
                    <p class="text-xs text-slate-500 dark:text-slate-400 mt-1" id="file-status-${index}">در صف</p>
                </div>
                <div class="w-24 mr-4 flex-shrink-0">
                    <div class="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2 overflow-hidden">
                        <div id="file-progress-${index}" class="bg-gradient-to-l from-blue-500 to-indigo-500 h-2 rounded-full progress-bar-inner" style="width: 0%"></div>
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

        // اطمینان از اینکه پروگرس تکی از ۱۰۰ بیشتر نشود
        let safeProgress = progress;
        if (safeProgress > 100) safeProgress = 100;

        if (progressEl && safeProgress >= 0) progressEl.style.width = `${safeProgress}%`;

        const totalFiles = uploadedFiles.length;
        const fileProgress = safeProgress < 0 ? 0 : (safeProgress / 100); 
        const filesDone = processedFiles.length;

        // محاسبه درصد کلی
        let overallProgress = ((filesDone + fileProgress) / totalFiles) * 100;

        // [!!!] فیکس اصلی: جلوگیری از رد شدن از ۱۰۰٪ [!!!]
        // وقتی فایل تمام می‌شود، هم در processedFiles شمرده می‌شود و هم fileProgress آن ۱۰۰ است
        // که باعث می‌شود درصد کل از ۱۰۰ رد شود (مثلا ۲۰۰٪). با این شرط محدود می‌کنیم.
        if (overallProgress > 100) overallProgress = 100;

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
        syncOutputFormatHighlight(); // چون ست‌کردن دستی .checked رویداد change را اجرا نمی‌کند
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
                        // پاکسازی کدهای مخرب HTML از ریشه همینجا انجام می‌شود
                        let cleanLine = lines[i].trim().replace(/<[^>]+>/g, '');
                        text.push(cleanLine);
                        i++;
                    }

                    const joinedText = text.join('\n');
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

    // [!!!] استخراج متن تمیز و بدون تگ مزاحم برای ترجمه دقیق هوش مصنوعی [!!!]
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
                
                // پاک کردن تمام تگ‌ها برای ارسال یک متن ۱۰۰٪ خالص به هوش مصنوعی (جلوگیری از توهم)
                let textWithoutTags = dialoguePart.replace(/\{[^}]*\}/g, '').trim();

                if (!textWithoutTags) return;
                if (dialoguePart.trim().endsWith('{\\p0}')) return;
                if (drawingCommandRegex.test(textWithoutTags)) return; 
                if (dialoguePart.includes('{') && textWithoutTags.replace(/\\N/g, '').replace(/\\h/g, ' ').length <= 2 && textWithoutTags.length > 0) return;

                let textForAI = textWithoutTags.replace(/\\N/g, '|').replace(/\\h/g, ' ').trim();

                if (textForAI.trim()) {
                    const startTimeMs = parseTimeToMS(dialogueObj.Start);
                    const endTimeMs = parseTimeToMS(dialogueObj.End);
                    const startFrame = msToFrames(startTimeMs, fps);
                    const endFrame = msToFrames(endTimeMs, fps);
                    const microdvdTime = `{${startFrame}}{${endFrame}}`;

                    mapping.push({
                        lineNumber: index,
                        microdvdTime: microdvdTime,
                        text: textForAI
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

    // [!!!] تابع بازسازی قطعی ASS (همراه با الگوریتم هوشمند معکوس‌سازی مختصات و فریز کردن علائم نگارشی) [!!!]
    function rebuildAssFromTranslation(originalAssContent, mapping, translatedArray) {
        let currentAssFormatFields = ['Layer', 'Start', 'End', 'Style', 'Name', 'MarginL', 'MarginR', 'MarginV', 'Effect', 'Text'];

        const originalLines = originalAssContent.split(/\r?\n/);
        let untranslatedInRebuild = 0;
        let eventsSection = false;

        for (const line of originalLines) {
             const trimmedLine = line.trim();
             if (trimmedLine.toLowerCase() === '[events]') { eventsSection = true; continue; }
             if (!eventsSection) continue;
             if (trimmedLine.toLowerCase().startsWith('format:')) { 
                currentAssFormatFields = trimmedLine.substring(7).trim().split(',').map(f => f.trim()); 
                break; 
             }
        }

        // --- 1. الگوریتم هوشمند معکوس‌سازی کلمات پازلی در زبان‌های RTL ---
        const timeGroups = new Map();
        mapping.forEach((mapItem, index) => {
            const timeKey = mapItem.microdvdTime;
            if (!timeGroups.has(timeKey)) timeGroups.set(timeKey, []);
            
            let posX = -1, posY = -1;
            // پیدا کردن \pos در تگ‌های ذخیره شده
            if (mapItem.tags) {
                for (let tag of mapItem.tags) {
                    const posMatch = tag.match(/\\pos\(\s*([\d.-]+)\s*,\s*([\d.-]+)\s*\)/);
                    if (posMatch) {
                        posX = parseFloat(posMatch[1]);
                        posY = parseFloat(posMatch[2]);
                        break;
                    }
                }
            }

            timeGroups.get(timeKey).push({
                mapIndex: index,
                posX: posX,
                posY: posY
            });
        });

        timeGroups.forEach(group => {
            const posItems = group.filter(item => item.posX !== -1 && item.posY !== -1);
            if (posItems.length > 1) {
                const yGroups = [];
                posItems.forEach(item => {
                    let foundGroup = yGroups.find(yg => Math.abs(yg.y - item.posY) <= 15);
                    if (foundGroup) {
                        foundGroup.items.push(item);
                    } else {
                        yGroups.push({ y: item.posY, items: [item] });
                    }
                });

                yGroups.forEach(yg => {
                    if (yg.items.length > 1) {
                        // مرتب‌سازی چپ به راست (LTR) بر اساس محور X
                        yg.items.sort((a, b) => a.posX - b.posX);
                        
                        // استخراج هندسه (X و Clip) برای هر کلمه
                        const geometries = yg.items.map(item => {
                            let clipValue = null;
                            if (mapping[item.mapIndex].tags) {
                                const allTags = mapping[item.mapIndex].tags.join('');
                                const clipMatch = allTags.match(/\\clip\([^)]+\)/);
                                if (clipMatch) clipValue = clipMatch[0];
                            }
                            return { x: item.posX, clip: clipValue };
                        });

                        // معکوس کردن هندسه (آینه کردن برای فارسی تا از راست به چپ چیده شوند)
                        geometries.reverse();
                        
                        // اعمال هندسه معکوس شده مستقیماً به تگ‌های اصلیِ ذخیره‌شده
                        yg.items.forEach((item, i) => {
                            const newGeo = geometries[i];
                            const mapTags = mapping[item.mapIndex].tags;
                            if (mapTags) {
                                for (let j = 0; j < mapTags.length; j++) {
                                    let tagStr = mapTags[j];
                                    if (tagStr.includes('\\pos')) {
                                        tagStr = tagStr.replace(/\\pos\(\s*[\d.-]+\s*,\s*[\d.-]+\s*\)/, `\\pos(${newGeo.x},${item.posY})`);
                                    }
                                    if (tagStr.includes('\\clip')) {
                                        if (newGeo.clip) {
                                            tagStr = tagStr.replace(/\\clip\([^)]+\)/, newGeo.clip);
                                        } else {
                                            tagStr = tagStr.replace(/\\clip\([^)]+\)/, '');
                                        }
                                    }
                                    mapTags[j] = tagStr;
                                }
                            }
                        });
                    }
                });
            }
        });
        // -----------------------------------------------------------------------------

        // --- 2. بازسازی متن و تزریق تگ‌ها ---
        mapping.forEach((mapItem, index) => {
            const { lineNumber, tags } = mapItem;

            let translatedText = "";
            const aiLine = translatedArray[index];
            if (aiLine) {
                const match = aiLine.match(/^{(\d+)}{(\d+)}(.*)$/);
                if (match) {
                    translatedText = match[3].replace(/\|/g, '\\N');
                }
            }

            if (translatedText) {
                const originalLine = originalLines[lineNumber];
                if (!originalLine || !originalLine.toLowerCase().startsWith('dialogue:')) return;

                const parts = robustAssSplit(originalLine.substring(9).trim(), currentAssFormatFields);
                if (parts.length < currentAssFormatFields.length) return;

                // در اینجا unmaskTags تگ‌هایی که هندسه‌ی آنها در بالا آینه شده است را به متن تزریق می‌کند
                let finalDialogueText = unmaskTags(translatedText, tags);

                // چسباندن تگ‌های متوالی به هم برای تمیزی (مانند {\c...}{\c...})
                finalDialogueText = finalDialogueText.replace(/\}\{/g, '\\');

                // --- 3. اعمال قطعی کاراکتر راست‌چین (RTL) و قفل کردن علائم نگارشی ---
                finalDialogueText = finalDialogueText.split('\\N').map(part => {
                    // جدا کردن تگ‌های ابتدای خط از متن
                    const match = part.match(/^((?:\{[^}]+\})*)(.*)$/);
                    if (match) {
                        const prefixTags = match[1];
                        let pureText = match[2];
                        
                        // حلقه حل مشکل جدا شدن حروف فارسی با تگ‌های رنگی داخلی
                        let previousText = "";
                        while(previousText !== pureText) {
                             previousText = pureText;
                             // تگ را به سمت چپِ حرف فارسی هُل می‌دهد تا حرف قبلی و بعدی به هم بچسبند
                             pureText = pureText.replace(/([\u0600-\u06FF])((?:\{[^}]+\})+)([\u0600-\u06FF])/g, '$2$1$3');
                        }

                        // [فیکس نهایی علائم نگارشی]: استفاده از مارکر \u200F (Right-to-Left Mark) 
                        // این مارکر باعث می‌شود نقطه‌ها و علامت تعجب در انتهای خط، کاملاً در انتهای خط فریز شوند
                        if (pureText.trim()) {
                            return `${prefixTags}\u202B\u200F${pureText.trim()}\u200F\u202C`;
                        } else {
                            return prefixTags;
                        }
                    }
                    return part.trim() ? `\u202B\u200F${part.trim()}\u200F\u202C` : part;
                }).join('\\N');
                // ----------------------------------------

                const dialogueObjRebuild = {};
                currentAssFormatFields.forEach((field, i) => { dialogueObjRebuild[field] = parts[i]; });
                dialogueObjRebuild['Text'] = finalDialogueText; 

                const newParts = currentAssFormatFields.map(field => dialogueObjRebuild[field]);
                originalLines[lineNumber] = 'Dialogue: ' + newParts.join(',');

            } else {
                untranslatedInRebuild++;
            }
        });

        return {
            rebuiltAss: originalLines.join('\r\n'),
            untranslatedCount: untranslatedInRebuild,
            styleReplacementFailureCount: 0 
        };
    }

    async function finalizeAssFile(assContent) {
        try {
            const fontResponse = await fetch('./fontVazirmatn.txt'); 
            if (!fontResponse.ok) throw new Error('فایل فونت (fontVazirmatn.txt) پیدا نشد.');
            const fontData = await fontResponse.text();

            const lines = assContent.split(/\r?\n/);
            const newLines = [];
            let inStylesSection = false;
            let inEventsSection = false;
            let inFontsSection = false;

            let fontNameIndex = 1; 
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
        const mergedLines = [];
        let untranslatedLinesData = [];

        // 1. ساخت Map از خروجی هوش مصنوعی (با مدیریت تکرار و خطوط بدون زمان)
        const translatedTextMap = new Map();

        if (aiOutputMicroDVD) {
            const aiLines = aiOutputMicroDVD.trim().split('\n');
            const microDVDLineRegex = /^{(\d+)}{(\d+)}(.*)$/;
            let lastSeenKey = null;

            for (const line of aiLines) {
                const trimmedLine = line.trim();
                if (!trimmedLine) continue;

                const match = trimmedLine.match(microDVDLineRegex);

                if (match) {
                    // حالت ۱: خط دارای فرمت زمانی صحیح است
                    const timeBlockKey = `{${match[1]}}{${match[2]}}`;
                    const text = match[3];
                    lastSeenKey = timeBlockKey;

                    if (translatedTextMap.has(timeBlockKey)) {
                        // اگر این زمان قبلاً وجود داشت (تکرار توسط AI)، متن جدید را به قبلی بچسبان
                        const currentText = translatedTextMap.get(timeBlockKey);
                        // از جداکننده فاصله استفاده می‌کنیم
                        translatedTextMap.set(timeBlockKey, currentText + " " + text);
                    } else {
                        translatedTextMap.set(timeBlockKey, text);
                    }
                } else if (lastSeenKey) {
                    // حالت ۲: خط بدون زمان است (ادامه خط قبلی توسط AI)
                    // متن را به آخرین کلید زمانی مشاهده شده اضافه می‌کنیم
                    const currentText = translatedTextMap.get(lastSeenKey);
                    translatedTextMap.set(lastSeenKey, currentText + " " + trimmedLine);
                }
            }
        }

        // 2. ادغام با خطوط اصلی بر اساس زمان (Time-Based Anchoring)
        const originalLineRegex = /^{(\d+)}{(\d+)}(.*)$/;

        for (let i = 0; i < originalLines.length; i++) {
            const originalLine = originalLines[i];
            const match = originalLine.match(originalLineRegex);

            if (match) {
                const timeBlockKey = `{${match[1]}}{${match[2]}}`;

                if (translatedTextMap.has(timeBlockKey)) {
                    // ترجمه پیدا شد
                    const translatedText = translatedTextMap.get(timeBlockKey);
                    mergedLines.push(`${timeBlockKey}${translatedText}`);
                } else {
                    // ترجمه پیدا نشد -> استفاده از متن اصلی و ثبت برای تلاش مجدد
                    mergedLines.push(originalLine);
                    untranslatedLinesData.push({
                        indexInMerged: i,
                        originalText: match[3]
                    });
                }
            } else {
                // خطوطی که فرمت زمانی ندارند (مثلاً هدر یا خطوط خراب) عیناً کپی می‌شوند
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
            const GEMINI_BASE_URL = proxyEnabled ? 'https://gemini-proxy.adrfyhlyf.workers.dev' : 'https://generativelanguage.googleapis.com';
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

    // --- تابع جدید: تشخیص هوشمند آهنگ با AI ---
    async function detectSongsWithAI(dialogueData, fps, apiKey, model) {
        if (!dialogueData || dialogueData.length === 0) return null;

        const totalLines = dialogueData.length;
        const lastFrame = dialogueData[totalLines - 1].endFrame;
        const totalSeconds = lastFrame / fps;

        // 10 دقیقه به فریم (600 ثانیه * fps)
        const tenMinutesInFrames = 600 * fps;

        // استخراج خطوط نامزد (۱۰ دقیقه اول و ۱۰ دقیقه آخر)
        // برای ویدیوهای کوتاهتر از ۲۰ دقیقه، کل ویدیو اسکن می‌شود
        let candidateLines = [];

        if (totalSeconds < 1200) { // کمتر از ۲۰ دقیقه
            candidateLines = dialogueData.map(d => ({ index: d.i, time: `{${d.startFrame}}-{${d.endFrame}}`, text: d.cleanText }));
        } else {
            // فیلتر کردن ۱۰ دقیقه اول و ۱۰ دقیقه آخر
            const startCutoff = tenMinutesInFrames;
            const endCutoff = lastFrame - tenMinutesInFrames;

            candidateLines = dialogueData.filter(d => {
                return d.startFrame < startCutoff || d.startFrame > endCutoff;
            }).map(d => ({ index: d.i, time: `{${d.startFrame}}-{${d.endFrame}}`, text: d.cleanText }));
        }

        if (candidateLines.length === 0) return null;

        // آماده‌سازی داده برای ارسال به هوش مصنوعی (JSON Stringify)
        // برای کاهش مصرف توکن، فقط موارد ضروری را ارسال می‌کنیم
        const dataForAI = JSON.stringify(candidateLines);

        const systemPrompt = `Analyze these subtitle lines. Identify the Start and End timestamps (or Line Indices) for the Opening Song (OP) and Ending Song (ED). Look for Romaji lyrics, song structures, or musical symbols. 
        
        Return ONLY a JSON object with this structure: 
        { 
            "op": { "start_index": number, "end_index": number }, 
            "ed": { "start_index": number, "end_index": number } 
        }. 
        
        If a song is not found, use null for that key (e.g. "op": null).
        The 'start_index' and 'end_index' must correspond to the 'index' field provided in the input data.
        DO NOT return markdown code blocks. Return raw JSON only.`;

        const userPrompt = `Here is the data: ${dataForAI}`;

        try {
            const responseText = await callSimpleGeminiAPI(systemPrompt, userPrompt, model, apiKey);

            // تلاش برای پارس کردن JSON (ممکن است AI آن را در مارک‌داون بگذارد)
            let jsonString = responseText;
            const jsonMatch = responseText.match(/```json([\s\S]*?)```/);
            if (jsonMatch) {
                jsonString = jsonMatch[1];
            } else if (responseText.includes('```')) {
                 jsonString = responseText.replace(/```/g, '');
            }

            const result = JSON.parse(jsonString);
            return result;
        } catch (error) {
            console.error("AI Song Detection Failed:", error);
            addLog(`خطا در تشخیص هوشمند آهنگ: ${error.message}`, true);
            return null;
        }
    }

    // --- 7. منطق خود-اصلاح‌گری (شامل پرامپت‌های اصلاح شده) ---
                async function performSelfCorrection(texts, fileIndex, model, apiKey, prompt, masterTranslationMap, fileId, isAlreadyFullyTranslated = false) {

        const foreignScriptRegex = /[\u0400-\u04FF\u0370-\u03FF\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF\uAC00-\uD7AF\u0E00-\u0E7F\u0900-\u097F\u0980-\u09FF\u0B80-\u0BFF\u0C00-\u0C7F\u0590-\u05FF]/;
        const englishRegex = /[a-zA-Z]/;
        const badCharacterRegex = /[\u0000-\u001F\u007F-\u009F\uFFFD\u061C]/;

        let linesToRetry = [];
        for (let i = 0; i < texts.length; i++) {
            if (typeof texts[i] !== 'string') continue; 
            const textPart = (texts[i].match(/\{(\d+)\}\{(\d+)\}(.*)/) || [])[3] || '';
            const textForCheck = textPart.replace(/___TAG_\d+___/g, '').replace(/\{[^}]+\}/g, ' ').trim();

            if (!textForCheck) continue; 
            if (isRomajiOrKanji(textForCheck)) continue; 

            if (foreignScriptRegex.test(textForCheck) || badCharacterRegex.test(textForCheck) || englishRegex.test(textForCheck)) {
                // پیدا کردن آیدی از مپ اصلی برای آپدیت صحیح (بر اساس محتوا)
                let foundId = -1;
                masterTranslationMap.forEach((val, key) => { if (val === textPart) foundId = key; });
                linesToRetry.push({ index: i, text: textPart, originalId: foundId });
            } 
        }

            if (linesToRetry.length === 0) {
    if (!isAlreadyFullyTranslated) {
        addLog("بررسی نهایی انجام شد و هیچ خطای ترجمه‌ای یا کاراکتر نامعتبری یافت نشد", false, "green");
    }
    return { lines: texts, unresolvedCount: 0 };
}

        addLog(`تعداد ${linesToRetry.length} خطای نگارشی یافت شد. در حال اصلاح ...`, false, "yellow"); 
        updateFileStatus(fileIndex, `در حال اصلاح ${linesToRetry.length} خطا...`, 85);

        const RETRY_CHUNK_SIZE = 10;
        const totalChunks = Math.ceil(linesToRetry.length / RETRY_CHUNK_SIZE);
        let correctedCount = 0;

        for (let i = 0; i < totalChunks; i++) {
            if (abortController.signal.aborted) throw new Error("عملیات لغو شد");
            const chunk = linesToRetry.slice(i * RETRY_CHUNK_SIZE, (i + 1) * RETRY_CHUNK_SIZE);

            const promptText = `The following JSON array contains subtitle lines that need correction (incomplete translation, English text remaining, or bad characters).
Please rewrite **each line completely** into fluent and correct Persian.
If a line contains \`___TAG_n___\` placeholders, you MUST preserve them exactly in the output.
You must return a **Valid JSON Array of Objects**, where each object has the SAME "id" as the input, and a "text" field with the translation.
Example: [{"id": 0, "text": "متن فارسی"}]

Input JSON Array:
${JSON.stringify(chunk.map((item, idx) => ({ id: idx, text: item.text })))}`;

            try {
                const response = await callSimpleGeminiAPI(prompt, promptText, model, apiKey);
                let jsonStr = response.trim().replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```$/, '').trim();

                let correctedChunk;
                try { 
                    correctedChunk = JSON.parse(jsonStr); 
                } catch(e) { continue; }

                if (Array.isArray(correctedChunk)) {
                    for (let j = 0; j < correctedChunk.length; j++) {
                        const resObj = correctedChunk[j];
                        if (resObj && typeof resObj.id === 'number' && typeof resObj.text === 'string') {
                            const originalIndex = chunk[resObj.id]?.index;
                            if (originalIndex !== undefined) {
                                const timePartMatch = texts[originalIndex].match(/\{(\d+)\}\{(\d+)\}/);
                                if (timePartMatch) {
                                    texts[originalIndex] = `${timePartMatch[0]}${resObj.text}`; 
                                    if (chunk[resObj.id].originalId !== -1) {
                                        masterTranslationMap.set(chunk[resObj.id].originalId, resObj.text);
                                    }
                                    correctedCount++;
                                }
                            }
                        }
                    }
                    saveProgress(fileId, masterTranslationMap);
                }
            } catch (error) { 
                addLog(`خطا در API هنگام اصلاح بخش ${i + 1}: ${error.message}`, true); 
                break;
            }
        }
        addLog(`اصلاح ${correctedCount} خط کامل شد.`);
        return { lines: texts, unresolvedCount: linesToRetry.length - correctedCount };
    }

    async function callSimpleGeminiAPI(systemInstruction, userPrompt, model, apiKey) {
        if (abortController?.signal.aborted) throw new Error("عملیات لغو شد");

        const proxyEnabled = proxyToggle.checked;
        const GEMINI_BASE_URL = proxyEnabled ? 'https://gemini-proxy.adrfyhlyf.workers.dev' : 'https://generativelanguage.googleapis.com';
        const API_URL = `${GEMINI_BASE_URL}/v1beta/models/${model}:generateContent?key=${apiKey}`;

        const safetySettings = [];
        if (safetyHarassmentToggle.checked) safetySettings.push({ category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" });
        if (safetyHateSpeechToggle.checked) safetySettings.push({ category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" });
        if (safetySexuallyExplicitToggle.checked) safetySettings.push({ category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" });
        if (safetyDangerousContentToggle.checked) safetySettings.push({ category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" });

        // دریافت دما و Top-P از UI
        const temperature = parseFloat(creativityRange.value) || 0.3;
        const topP = parseFloat(topPRange.value) || 0.9;

                const generationConfig = { temperature: temperature, topP: topP };
        
        if (thinkingModeToggle && thinkingModeToggle.checked) {
            generationConfig.thinkingConfig = { thinkingLevel: "high" };
        }

        const payload = {
            systemInstruction: { parts: [{ text: systemInstruction }] },
            contents: [{ parts: [{ text: userPrompt }] }],
            generationConfig: generationConfig
        };
        if (safetySettings.length > 0) payload.safetySettings = safetySettings;


        const MAX_ATTEMPTS = 3; 
        const RETRY_DELAY = 10000; 

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
                    throw error; 
                }
            }
        }
        throw new Error("Failed after max retries.");
    }

        async function performMissingLineCorrection(mergedLinesArray, untranslatedData, fileIndex, model, apiKey, systemPrompt, masterTranslationMap, fileId) {
        if (untranslatedData.length === 0) return { lines: mergedLinesArray, unresolvedCount: 0 }; 

        addLog(`تعداد ${untranslatedData.length} خط جا افتاده یافت شد. در حال تلاش برای ترجمه ...`, false, "yellow");
        updateFileStatus(fileIndex, `در حال ترجمه ${untranslatedData.length} خط جا افتاده...`, 82); 

        const RETRY_CHUNK_SIZE = 10;
        const totalChunks = Math.ceil(untranslatedData.length / RETRY_CHUNK_SIZE);
        let correctedCount = 0;

        for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
            if (abortController.signal.aborted) throw new Error("عملیات لغو شد");

            const chunk = untranslatedData.slice(chunkIndex * RETRY_CHUNK_SIZE, (chunkIndex + 1) * RETRY_CHUNK_SIZE);

            const promptText = `The following JSON array contains subtitle lines that were skipped in the initial translation.
Please translate **each line completely** into fluent Persian.
If a line contains \`___TAG_n___\` placeholders, you MUST preserve them exactly in the output.
You must return a **Valid JSON Array of Objects**, where each object has the SAME "id" as the input, and a "text" field with the Persian translation.
Example: [{"id": 0, "text": "ترجمه فارسی"}]

Input JSON Array:
${JSON.stringify(chunk.map((item, idx) => ({ id: idx, text: item.originalText })))}`;

            try {
                const response = await callSimpleGeminiAPI(systemPrompt, promptText, model, apiKey);
                let jsonStr = response.trim().replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```$/, '').trim();

                let correctedChunk;
                try { 
                    correctedChunk = JSON.parse(jsonStr); 
                } catch(e) { 
                    addLog(`خطای فرمت پاسخ در ترجمه خطوط جا افتاده بخش ${chunkIndex + 1}.`, true); 
                    continue; 
                }

                if (Array.isArray(correctedChunk)) {
                    for (let j = 0; j < correctedChunk.length; j++) {
                        const resObj = correctedChunk[j];
                        if (resObj && typeof resObj.id === 'number' && typeof resObj.text === 'string') {
                            const originalData = chunk[resObj.id];
                            if (originalData) {
                                const originalLineIndex = originalData.indexInMerged;
                                const timePartMatch = mergedLinesArray[originalLineIndex].match(/\{(\d+)\}\{(\d+)\}/);
                                if (timePartMatch) {
                                    mergedLinesArray[originalLineIndex] = `${timePartMatch[0]}${resObj.text}`; 
                                    // ثبت در حافظه با استفاده از originalId
                                    masterTranslationMap.set(originalData.originalId, resObj.text);
                                    correctedCount++;
                                }
                            }
                        }
                    }
                    saveProgress(fileId, masterTranslationMap);
                }
            } catch (error) { 
                addLog(`خطا در API هنگام ترجمه جا افتاده: ${error.message}`, true); 
                break;
            }
        }
        addLog(`ترجمه ${correctedCount} خط جا افتاده کامل شد.`);
        return { lines: mergedLinesArray, unresolvedCount: untranslatedData.length - correctedCount };
    }

    // --- 8. منطق اصلی ترجمه (بازنویسی و ارتقا یافته) ---

    async function getTranslationStream(systemInstruction, modelContents, onChunk, onEnd, onError, signal) {
        const apiKey = apiKeyInput.value.trim();
        const model = modelSelect.value;

        const proxyEnabled = proxyToggle.checked;
        const GEMINI_BASE_URL = proxyEnabled ? 'https://gemini-proxy.adrfyhlyf.workers.dev' : 'https://generativelanguage.googleapis.com';
        const url = `${GEMINI_BASE_URL}/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;

        try {
            const safetySettings = [];
            if (safetyHarassmentToggle.checked) safetySettings.push({ category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" });
            if (safetyHateSpeechToggle.checked) safetySettings.push({ category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" });
            if (safetySexuallyExplicitToggle.checked) safetySettings.push({ category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" });
            if (safetyDangerousContentToggle.checked) safetySettings.push({ category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" });

            // دریافت دما و Top-P از UI
            const temperature = parseFloat(creativityRange.value) || 0.3;
            const topP = parseFloat(topPRange.value) || 0.9;

                        const generationConfig = {
                temperature: temperature, 
                topP: topP,      
            };

            if (thinkingModeToggle && thinkingModeToggle.checked) {
                generationConfig.thinkingConfig = { thinkingLevel: "high" };
            }

            const requestBody = {
                systemInstruction: { parts: [{ text: systemInstruction }] },
                contents: modelContents, 
                generationConfig: generationConfig
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

        userManuallyAborted = false; 
        abortController = new AbortController(); 

        isTranslating = true;
        startTranslation.classList.add('hidden');
        stopTranslation.classList.remove('hidden');
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

        addLog("شروع عملیات ترجمه...");

        // [Modified] Added accumulatedMap and fileId params
        async function translateChunk(content, customPrompt, fileName, progressStart, progressEnd, fileIndex, accumulatedMap, fileId) {
            if (!content.trim()) return '';
            updateFileStatus(fileIndex, `در حال آپلود (${fileName})...`, progressStart);

            const apiKey = apiKeyInput.value.trim();

            // اعمال لحن به پرامپت سیستم
            let systemInstruction = systemPrompt.value; 
            const tone = toneSelect.value;
            if (tone === 'formal') {
                systemInstruction += "\n\n[دستور لحن: تمام ترجمه‌ها باید با لحن رسمی، کتابی و ادبی انجام شوند. از کلمات عامیانه و شکسته پرهیز کنید.]";
            } else {
                systemInstruction += "\n\n[دستور لحن: تمام ترجمه‌ها باید با لحن محاوره‌ای، دوستانه و مناسب انیمه (شکسته) انجام شوند. لحن رسمی ممنوع است.]";
            }

            const fileUri = await uploadFileToGemini(
                content, fileName, apiKey,
                (p) => updateFileStatus(fileIndex, `در حال آپلود... ${Math.round(p)}%`, progressStart + (p * 0.05)), 
                abortController.signal
            );

            updateFileStatus(fileIndex, "هوش مصنوعی درحال تفکر است...", progressStart + 5);

            // [!!!] تغییر: چک کردن تاگل قبل از نمایش پیام اولیه [!!!]
            if (liveOutputToggle.checked) {
                liveOutput.textContent = 'هوش مصنوعی در حال تفکر است و این فرایند ممکن است طول بکشد'; 
                liveOutput.style.display = 'block'; 
                liveOutput.style.direction = 'rtl';
                liveOutput.style.textAlign = 'right';
            } else {
                liveOutput.style.display = 'none';
            }

            let thinkingStartTime = Date.now();
            const baseThinkingText = 'هوش مصنوعی درحال تفکر است... ';

            // [!!!] تغییر: تایمر فقط نوار وضعیت را آپدیت می‌کند، نه باکس لایو [!!!]
            let thinkingTimer = setInterval(() => {
                const elapsedTime = ((Date.now() - thinkingStartTime) / 1000).toFixed(1);
                const thinkingMsg = baseThinkingText + `${elapsedTime} ثانیه`;

                // به‌روزرسانی نوار وضعیت
                updateFileStatus(fileIndex, thinkingMsg, progressStart + 5);
            }, 100);

            const modelContents = [
                { parts: [ { text: customPrompt } ] }, 
                { parts: [ { fileData: { mime_type: "text/plain", file_uri: fileUri } } ] } 
            ];

            const MAX_ATTEMPTS = 3; 
            const RETRY_DELAY = 10000; 

            for (let attempt = 1; attempt <= MAX_ATTEMPTS + 1; attempt++) {
                if (abortController.signal.aborted) throw new Error("عملیات لغو شد");

                try {
                    const translatedText = await new Promise((resolve, reject) => {
                        let isFirstChunk = true;

                        const TIMEOUT_DURATION = 250 * 1000;
                        if (content.split('\n').length > 1000) {
                             // Dynamic timeout adjustment logic logic (already present in logic block not fully shown in previous diffs, adding safe check)
                             // This is handled by previous request, ensuring logic stays valid.
                        } 
                        const timeoutController = new AbortController();
                        const timeoutId = setTimeout(() => {
                            timeoutController.abort(new Error(`ترجمه بیش از ${TIMEOUT_DURATION / 1000} ثانیه طول کشید (Timeout).`));
                        }, TIMEOUT_DURATION);

                        const onMainAbort = () => {
                            timeoutController.abort(new Error("عملیات لغو شد"));
                        };
                        abortController.signal.addEventListener('abort', onMainAbort, { once: true });


                        getTranslationStream(
                            systemInstruction, 
                            modelContents,     
                            (currentFullText) => { 
                                // [!!!] منطق توقف تایمر در اولین دریافت (TTFT) [!!!]
                                if (thinkingTimer) { 
                                    clearInterval(thinkingTimer); 
                                    thinkingTimer = null; 

                                    // [!!!] تغییر: پیام لاگ جدید [!!!]
                                    addLog("تفکر هوش مصنوعی به پایان رسید در حال دریافت ترجمه", false, "green");
                                }

                                if (isFirstChunk) { 
                                    if (liveOutputToggle.checked) liveOutput.textContent = ''; // Clear only if visible
                                    isFirstChunk = false; 
                                }

                                                               const lines = currentFullText.split('\n');
                                const extractedTexts = lines
                                    .map(line => {
                                        // استخراج ایمن خطوط با استفاده از کدملی (ID)
                                        const match = line.match(/^\[ID:\s*(\d+)\]\s*(\{\d+\}\{\d+\})(.*)$/i);
                                        if (match) {
                                            if (accumulatedMap) {
                                                const id = parseInt(match[1], 10); // ID به عنوان کلید یکتا
                                                const text = match[3].trim();
                                                
                                                // ذخیره متن به همراه ID در حافظه
                                                accumulatedMap.set(id, text);

                                                if (saveProgressTimeout) clearTimeout(saveProgressTimeout);
                                                saveProgressTimeout = setTimeout(() => {
                                                    saveProgress(fileId, accumulatedMap);
                                                }, 1500);
                                            }
                                            return match[3].trim(); // ارسال فقط متن برای نمایش زنده
                                        }
                                        return null;
                                    })
                                    .filter(text => text !== null);
                                // [!!!] تغییر: آپدیت DOM فقط در صورت فعال بودن تاگل [!!!]
                                if (liveOutputToggle.checked) {
                                    liveOutput.style.display = 'block';
                                    // فقط برای نمایش زنده، تگ‌های ___TAG_n___ رو حذف می‌کنیم
                                    // داده‌ی اصلی دست‌نخورده باقی می‌مونه و فایل خروجی کامل خواهد بود
                                    const displayText = extractedTexts.join('\n').replace(/\|/g, '\n')
                                        .replace(/___TAG_\d+___/g, '');
                                    liveOutput.textContent = displayText;
                                    liveOutput.scrollTop = liveOutput.scrollHeight;
                                } else {
                                    liveOutput.style.display = 'none';
                                }

                                const percentage = (lines.length / (content.match(/\n/g) || []).length);
                                updateFileStatus(fileIndex, `در حال دریافت ترجمه... ${lines.length} خط`, progressStart + 5 + (percentage * (progressEnd - (progressStart + 5)) * 0.9)); 
                            },
                            (finalText) => { 
                                if (thinkingTimer) { clearInterval(thinkingTimer); thinkingTimer = null; }
                                clearTimeout(timeoutId); 
                                abortController.signal.removeEventListener('abort', onMainAbort); 
                                resolve(finalText);
                            },
                            (error) => { 
                                if (thinkingTimer) { clearInterval(thinkingTimer); thinkingTimer = null; }
                                clearTimeout(timeoutId); 
                                abortController.signal.removeEventListener('abort', onMainAbort); 
                                reject(error); 
                            }, 
                            timeoutController.signal 
                        );
                    });
                    return translatedText; 

                } catch (error) {
                    if (abortController.signal.aborted) throw error;

                    const errorMessage = error.message.toLowerCase();

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

                         thinkingStartTime = Date.now();

                         if (!thinkingTimer) {
                             // [!!!] Re-create timer only for status bar [!!!]
                             thinkingTimer = setInterval(() => {
                                const elapsedTime = ((Date.now() - thinkingStartTime) / 1000).toFixed(1);
                                const thinkingMsg = baseThinkingText + `${elapsedTime} ثانیه`;
                                updateFileStatus(fileIndex, thinkingMsg, progressStart + 5);
                            }, 100);
                         }
                    } else {
                        throw error; 
                    }
                }
            }
        }

        // [!!!] تغییر: استفاده از حلقه دینامیک برای پشتیبانی از اضافه شدن فایل در حین اجرا [!!!]
        for (let i = 0; i < uploadedFiles.length; i++) {
            const file = uploadedFiles[i];
            const apiKey = apiKeyInput.value.trim();
            const model = modelSelect.value;
            const prompt = systemPrompt.value;

            // --- [NEW] Start Resume Logic ---
            const fileId = getFileId(file);
            let masterTranslationMap = loadProgress(fileId);

            // -------------------------------

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
                let outputFormatChoice = outputFormatRadio ? outputFormatRadio.value : 'ass';

                // [!!!] حذف منطق اجبار ASS [!!!]
                // قبلاً اینجا کدی بود که اگر فایل ASS بود، خروجی را به ASS تغییر می‌داد. آن را حذف کردیم.

                // [!!!] منطق مهم: فقط اگر ورودی ASS باشد و کاربر خروجی ASS بخواهد، استایل‌ها حفظ می‌شوند.
                useAssPath = file.name.toLowerCase().endsWith('.ass') && outputFormatChoice === 'ass';

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

                // یافتن طولانی‌ترین زمان در میان تمام دیالوگ‌ها (رفع مشکل نامرتب بودن فایل‌های ASS)
                let maxEndMs = 0;
                originalDialogueBlocks.forEach(block => {
                    const currentEndMs = parseTimeToMS(block.end);
                    if (currentEndMs > maxEndMs) {
                        maxEndMs = currentEndMs;
                    }
                });
                originalLastEndFrame = Math.floor((maxEndMs / 1000) * fps);
                
                const dialogueData = originalDialogueBlocks.map((block, i) => {
                    const startFrame = timeToFrames(block.start, fps);
                    const endFrame = timeToFrames(block.end, fps);
                    
                    let cleanText = block.text;

                    if (!useAssPath) {
                        // فقط تگ‌های احتمالی ASS را پاک می‌کنیم. 
                        // تگ‌های HTML قبلا پاک شده‌اند. خطوط جدید (\n) باید حفظ شوند تا هوش مصنوعی جملات را درست تشخیص دهد.
                        cleanText = block.text.replace(/\{[^}]+\}/g, ' ').trim();
                    }

                    // کاراکتر \n در اینجا با | جایگزین می‌شود تا برای هوش مصنوعی قابل فهم باشد
                    const microLine = `{${startFrame}}{${endFrame}}${cleanText.replace(/\n/g, '|')}`;
                    return { i, microLine, cleanText, startFrame, endFrame, block, isSong: false, songType: null };
                });

                // --- منطق تشخیص هوشمند آهنگ (NEW) ---
                if (aiDetectionToggle.checked) {
                    addLog('در حال اسکن هوشمند ۱۰ دقیقه ابتدا و انتها برای یافتن آهنگ...', false, "yellow");
                    updateFileStatus(i, "اسکن هوشمند آهنگ...", 5);

                    const songIndices = await detectSongsWithAI(dialogueData, fps, apiKey, model);

                    if (songIndices) {
                        let opCount = 0;
                        let edCount = 0;

                        // اعمال ایندکس‌ها
                        if (songIndices.op && songIndices.op.start_index !== null && songIndices.op.end_index !== null) {
                            for (let j = songIndices.op.start_index; j <= songIndices.op.end_index; j++) {
                                if (dialogueData[j]) {
                                    dialogueData[j].isSong = true;
                                    dialogueData[j].songType = 'OP';
                                    opCount++;
                                }
                            }
                            addLog(`آهنگ Opening شناسایی شد: از خط ${songIndices.op.start_index} تا ${songIndices.op.end_index}`, false, "green");
                        }

                        if (songIndices.ed && songIndices.ed.start_index !== null && songIndices.ed.end_index !== null) {
                            for (let j = songIndices.ed.start_index; j <= songIndices.ed.end_index; j++) {
                                if (dialogueData[j]) {
                                    dialogueData[j].isSong = true;
                                    dialogueData[j].songType = 'ED';
                                    edCount++;
                                }
                            }
                            addLog(`آهنگ Ending شناسایی شد: از خط ${songIndices.ed.start_index} تا ${songIndices.ed.end_index}`, false, "green");
                        }

                        if (opCount === 0 && edCount === 0) {
                            addLog("هوش مصنوعی هیچ آهنگی پیدا نکرد. استفاده از روش سنتی...", false, "yellow");
                            // فال‌بک به روش قدیمی
                            dialogueData.forEach(d => {
                                if (isRomajiOrKanji(d.cleanText)) d.isSong = true;
                            });
                        }
                    } else {
                         addLog("خطا در اسکن هوشمند یا نتیجه خالی. استفاده از روش سنتی...", false, "yellow");
                         // فال‌بک به روش قدیمی
                         dialogueData.forEach(d => {
                            if (isRomajiOrKanji(d.cleanText)) d.isSong = true;
                         });
                    }

                } else {
                    // روش سنتی (غیر فعال بودن تاگل)
                    dialogueData.forEach(d => {
                        if (isRomajiOrKanji(d.cleanText)) d.isSong = true;
                    });
                }

                // --- ارسال یکپارچه با سیستم ضد-توهم (ID Tracking) ---
                let fullMicroDVD = '';
                let linesObjArray = [];

                if (useAssPath) {
                     // [اصلاح مهم]: حذف کامل split('\n') و استفاده از نگاشت ۱ به ۱ و مستقیم
                     linesObjArray = assMapping.map(m => {
                         return { 
                             id: m.lineNumber, 
                             time: m.microdvdTime, 
                             text: m.text, 
                             line: `[ID:${m.lineNumber}]${m.microdvdTime}${m.text}` 
                         };
                     });
                } else {
                     linesObjArray = dialogueData.map(d => {
                         return { id: d.i, time: `{${d.startFrame}}{${d.endFrame}}`, text: d.cleanText, line: `[ID:${d.i}]${d.microLine}` };
                     });
                }

                // فیلتر کردن خطوطی که از قبل در حافظه ترجمه شده‌اند (سیستم Resume)
                fullMicroDVD = linesObjArray
                    .filter(l => !masterTranslationMap.has(l.id)) 
                    .map(l => l.line).join('\n');

                                const pendingLinesCount = fullMicroDVD ? fullMicroDVD.split('\n').filter(l=>l).length : 0;

                // متغیر جدید برای تشخیص اینکه آیا فایل از قبل کامل بوده یا خیر
                let isAlreadyFullyTranslated = false;

                if (masterTranslationMap.size > 0) {
                    if (pendingLinesCount === 0) {
                        isAlreadyFullyTranslated = true;
                        addLog("این فایل از قبل کامل ترجمه شده بود اگر بخواهید می توانید دوباره آن را دانلود کنید", false, "green");
                    } else {
                        addLog("این فایل قبلا به صورت ناقص ترجمه شده بود ارسال ادامه فایل به هوش مصنوعی برای کامل کردن ترجمه", false, "green");
                        addLog(`تعداد ${pendingLinesCount} خط دیالوگ جا مانده یافت شد، در حال ارسال...`);
                    }
                } else {
                    addLog(`تعداد ${pendingLinesCount} خط دیالوگ یافت شد، در حال ارسال به هوش مصنوعی...`);
                }

if (pendingLinesCount > 0) {
                    const unifiedPrompt = systemPrompt.value + 
                    "\n\n[قانون حیاتی و غیرقابل نقض]: فایل ورودی شامل کل زیرنویس است و در ابتدای هر خط یک شناسه منحصربه‌فرد (مانند [ID:12]) وجود دارد. شما موظف هستید دقیقاً این شناسه و فرمت زمانی را در ابتدای هر خط خروجی حفظ کنید (مثال خروجی صحیح: [ID:12]{100}{200}سلام). تحت هیچ شرایطی خطوط را ادغام نکنید و هیچ خطی را جا نیندازید. خطوط آواز (OP/ED) را شاعرانه و بقیه را محاوره‌ای ترجمه کنید.";

                    await translateChunk(fullMicroDVD, unifiedPrompt, file.name, 10, 80, i, masterTranslationMap, fileId);
                }

                if (!isAlreadyFullyTranslated) {
                    addLog("دریافت ترجمه انجام شد. در حال تطبیق و مرتب‌سازی دقیق خطوط...");
                }
                updateFileStatus(i, "در حال ادغام نتایج...", 80);

                let microDVDSplitted = [];
                let untranslatedLinesData = [];
                let totalUnresolvedErrors = 0;

                // چیدن دقیق خطوط سر جای خود (بدون امکان به هم ریختن زمان‌ها)
                linesObjArray.forEach(l => {
                    const id = l.id;
                    const timeKey = l.time;
                    let pushIndex = microDVDSplitted.length; 

                    if (masterTranslationMap.has(id)) {
                        const transText = cleanAIOutput(masterTranslationMap.get(id)).replace(/\n/g, '|');
                        microDVDSplitted.push(`${timeKey}${transText}`);
                    } else {
                        // اگر به خاطر ارور لیمیت در اینترنت قطع شد، نسخه اصلی رو بذار سر جاش و برای توابع اصلاحی ثبت کن
                        microDVDSplitted.push(`${timeKey}${l.text.replace(/\n/g, '|')}`);
                        untranslatedLinesData.push({ originalId: id, indexInMerged: pushIndex, originalText: l.text });
                    }
                });

                const isComplete = untranslatedLinesData.length === 0;
                if (!isComplete) {
                    addLog("هشدار: بخش‌هایی از فایل ترجمه نشده است.", false, "yellow");
                } else {
                    if (!isAlreadyFullyTranslated) {
                        addLog("بررسی اولیه: ترجمه کامل است و هیچ دیالوگی جا نیفتاده است.", false, "green");
                    }
                }

                if (untranslatedLinesData.length > 0) {                    
                    const missingResult = await performMissingLineCorrection(
                        microDVDSplitted, 
                        untranslatedLinesData, 
                        i, 
                        model, 
                        apiKey, 
                        prompt,
                        masterTranslationMap, 
                        fileId                
                    );
                    microDVDSplitted = missingResult.lines;
                    totalUnresolvedErrors += missingResult.unresolvedCount;
                }

                updateFileStatus(i, "در حال بررسی خطاهای نگارشی...", 85);
                                const selfResult = await performSelfCorrection(
                    microDVDSplitted, 
                    i, 
                    model, 
                    apiKey, 
                    prompt,
                    masterTranslationMap, 
                    fileId,
                    isAlreadyFullyTranslated // <--- این خط اضافه شد
                ); 
                microDVDSplitted = selfResult.lines;
                totalUnresolvedErrors += selfResult.unresolvedCount;

                const finalMicroDVDWithCorrections = microDVDSplitted.join('\n'); 


                let finalContent;
                const outputExt = outputFormatChoice === 'srt' ? '.srt' : '.ass';

                // --- استخراج متون واترمارک شروع و پایان ---
                let extraBlocks = [];
                const totalVideoDurationMs = (originalLastEndFrame / fps) * 1000;

                if (startTextEnabled.checked && startTextInput.value.trim()) {
                    extraBlocks.push({
                        start: msToASS((parseFloat(startTextStartTime.value) || 5) * 1000),
                        end: msToASS((parseFloat(startTextEndTime.value) || 15) * 1000),
                        text: startTextInput.value.trim()
                    });
                }
                
                if (endTextEnabled.checked && endTextInput.value.trim()) {
                    let startMs = Math.max(0, totalVideoDurationMs - ((parseFloat(endTextStartFromEnd.value) || 120) * 1000));
                    let endMs = startMs + ((parseFloat(endTextDuration.value) || 10) * 1000);
                    extraBlocks.push({
                        start: msToASS(startMs),
                        end: msToASS(endMs),
                        text: endTextInput.value.trim()
                    });
                }                

                                if (useAssPath) {
                    addLog(`بازسازی فایل ${file.name} با حفظ استایل...`);
                    // با سیستم جدید، آرایه microDVDSplitted را مستقیم می‌دهیم و نیازی به توابع واسطه نداریم
                    const rebuildResult = rebuildAssFromTranslation(originalAssContentForFile, assMapping, microDVDSplitted);
                    finalContent = rebuildResult.rebuiltAss;

                    if (rebuildResult.untranslatedCount > 0) {
                        addLog(`هشدار: ${rebuildResult.untranslatedCount} خط در بازسازی ASS یافت نشد.`, false, "yellow");
                    }
                    
                    if (extraBlocks.length > 0) {
                        let eventsLines = extraBlocks.map(b => `Dialogue: 0,${b.start},${b.end},Default,,0,0,0,,{\\an8}${b.text.replace(/\r?\n/g, '\\N')}`);
                        finalContent += '\r\n' + eventsLines.join('\r\n');
                    }

                              } else {
                    const microDVDLineRegex = /^{(\d+)}{(\d+)}(.*)$/;
                    
                    // به لطف سیستم ID-based، آرایه microDVDSplitted دقیقاً 1 به 1 متناظر با فایل اصلی است
                    const correctedTexts = originalDialogueBlocks.map((block, indexData) => {
                        const aiLine = microDVDSplitted[indexData]; 
                        let text = block.text; // پیش‌فرض: متن اصلی (اگر به خاطر لیمیت ترجمه نشده باشد)
                        
                        if (aiLine) {
                            const match = aiLine.match(microDVDLineRegex);
                            if (match) {
                                text = match[3];
                                // اعمال راست‌چین (RTL) و بازگرداندن شکستگی‌های خط
                                text = text.split('|').map(part => `\u202B${part.trim()}\u202C`).join('\n');
                            }
                        }
                        return text;
                    });

                    if (outputFormatChoice === 'srt') {
                        finalContent = buildSRT(originalDialogueBlocks, correctedTexts, extraBlocks);
                    } else {
                        finalContent = buildASS(originalDialogueBlocks, correctedTexts, file.name, dialogueData, extraBlocks);
                    }
                }

                if (outputFormatChoice === 'ass') {
                    addLog(`در حال جاسازی فونت در فایل ${file.name}...`);
                    finalContent = await finalizeAssFile(finalContent);
                }

                                processedFiles.push({
                    name: file.name.replace(/\.(srt|vtt|ass)$/i, outputExt),
                    content: finalContent 
                });
                
                if (totalUnresolvedErrors === 0) {
                    clearProgress(fileId);
                    updateFileStatus(i, "کامل شد", 100);
                    addLog(`--- پردازش فایل ${file.name} با موفقیت کامل شد. ---`, false, "green");
                } else {
                    updateFileStatus(i, "تکمیل با خطا (نیازمند ادامه)", 100);
                    addLog(`--- پردازش پایان یافت اما ${totalUnresolvedErrors} خط به دلیل محدودیت API ترجمه یا اصلاح نشد! فایل خروجی موقتاً ساخته شد. کلید API را تغییر دهید و دوباره دکمه ترجمه را بزنید تا ادامه یابد. ---`, false, "yellow");
                }

            } catch (error) {
                liveOutput.style.display = 'none'; 

                let userFriendlyMessage = '';
                const errorMessageText = error.message || 'خطایی نامشخص رخ داد.';

                // --- [NEW] Error Handling for Resume ---
                if (!userManuallyAborted && (error.name !== 'AbortError' && !error.message.includes("لغو شد"))) {
                    addLog("Translation stopped. Progress saved. Reload the page and upload the file again to resume.", true);
                }
                // ----------------------------------------

                if (userManuallyAborted && (error.name === 'AbortError' || errorMessageText.includes("لغو شد"))) {
                    userFriendlyMessage = '<p>عملیات ترجمه توسط کاربر متوقف شد.</p>';
                    translationStatusMessage.innerHTML = '❌ ترجمه توسط کاربر متوقف شد.';
                    translationStatusMessage.className = 'status-message status-aborted';

                 } else if (errorMessageText.includes("LIMIT_REACHED") && (errorMessageText.includes("limit: 0") || errorMessageText.includes("limit:0"))) {
                    userFriendlyMessage = `<p class="font-bold text-red-600">شما اجازه استفاده از این مدل را در طرح رایگان ندارید.</p><p class="mt-2 text-sm">مدل انتخابی (مثلاً Gemini 3 Pro) ممکن است در حال حاضر برای اکانت‌های رایگان در دسترس نباشد یا سهمیه آن صفر باشد. لطفاً مدل دیگری (مانند Gemini 2.5 Pro یا Flash) را انتخاب کنید.</p>`;
                    translationStatusMessage.innerHTML = '❌ محدودیت دسترسی به مدل (Limit 0).';
                    translationStatusMessage.className = 'status-message status-aborted';

                    showError(userFriendlyMessage, true); 
                    addLog(`خطای لیمیت صفر: ${errorMessageText}`, true);
                    updateFileStatus(i, "توقف (Limit)", -1);
                    break; 

                } else if (errorMessageText.includes("LIMIT_REACHED")) {
                    userFriendlyMessage = `<p class="font-bold text-red-600">تعداد درخواست‌های شما بیش از حد مجاز است. لطفاً بعداً تلاش کنید.</p>`;
                    translationStatusMessage.innerHTML = '❌ تعداد درخواست‌های شما بیش از حد مجاز است.';
                    translationStatusMessage.className = 'status-message status-aborted';

                    showError(userFriendlyMessage, true); 
                    addLog(`خطای بحرانی لیمیت: ${errorMessageText}`, true);
                    updateFileStatus(i, "توقف (Limit)", -1);
                    break; 

                } else if (error.name === 'AbortError' || errorMessageText.includes("لغو شد") || errorMessageText.includes("Timeout")) {
                    userFriendlyMessage = `<p class="font-bold">عملیات متوقف شد (خطای مرورگر یا شبکه).</p><pre class="error-pre bg-gray-900 p-2 rounded mt-2 text-xs">${escapeHTML(errorMessageText)}</pre><p class="mt-2">مرورگر ممکن است عملیات را به دلیل رفتن به پس‌زمینه (خروج از برنامه) یا ناپایداری شبکه متوقف کرده باشد.</p><p class="font-bold mt-4">راه حل:</p><ol class="list-decimal list-inside pr-4 mt-2"><li>در حین ترجمه، برنامه را در پس‌زمینه نبرید.</li><li>دوباره تلاش کنید.</li></ol>`;
                    translationStatusMessage.innerHTML = '⚠️ عملیات متوقف شد (خطای مرورگر).';
                    translationStatusMessage.className = 'status-message status-incomplete'; 

                } else if (errorMessageText.toLowerCase().includes('location') || errorMessageText.toLowerCase().includes('permission denied')) {
                    userFriendlyMessage = `<p class="font-bold">خطا در دسترسی (مشکل تحریم یا فیلترشکن).</p><pre class="error-pre bg-gray-900 p-2 rounded mt-2 text-xs">${escapeHTML(errorMessageText)}</pre><p class="mt-2">سرور گوگل به دلیل موقعیت جغرافیایی شما اجازه دسترسی نمی‌دهد.</p><p class="font-bold mt-4">راه حل:</p><ol class="list-decimal list-inside pr-4 mt-2"><li>گزینه "استفاده از پراکسی" را در تنظیمات فعال کنید.</li><li>یا، از یک فیلترشکن قوی استفاده کنید.</li></ol>`;
                    translationStatusMessage.innerHTML = '❌ خطای دسترسی/فیلترشکن.';
                    translationStatusMessage.className = 'status-message status-aborted';
                } else if (errorMessageText.toLowerCase().includes('networkerror') || errorMessageText.includes('522') || errorMessageText.includes('524')) {
                    userFriendlyMessage = `<p class="font-bold">خطای شبکه (NetworkError یا خطای پراکسی).</p><pre class="error-pre bg-gray-900 p-2 rounded mt-2 text-xs">${escapeHTML(errorMessageText)}</pre><p class="mt-2">اتصال به سرور (یا پراکسی) ناپایدار است یا قطع شده.</p><p class="font-bold mt-4">راه حل:</p><ol class="list-decimal list-inside pr-4 mt-2"><li>از پایداری اینترنت خود مطمئن شوید.</li><li>اگر از پراکسی استفاده نمی‌کنید، فیلترشکن را بررسی کنید.</li><li>اگر از پراکسی استفاده می‌کنید، اتصال اینترنت خود را بررسی کنید.</li></ol>`;
                    translationStatusMessage.innerHTML = '❌ خطای شبکه.';
                    translationStatusMessage.className = 'status-message status-aborted';
                } else if (errorMessageText.toLowerCase().includes('api key not valid')) {
                    userFriendlyMessage = `<p class="font-bold">کلید API نامعتبر است.</p><pre class="error-pre bg-gray-900 p-2 rounded mt-2 text-xs">${escapeHTML(errorMessageText)}</pre><p class="mt-2">کلید وارد شده صحیح نیست یا منقضی شده است.</p>`;
                    translationStatusMessage.innerHTML = '❌ کلید API نامعتبر.';
                    translationStatusMessage.className = 'status-message status-aborted';

                } else if (errorMessageText.toLowerCase().includes('overloaded') || errorMessageText.toLowerCase().includes('503')) {
                    userFriendlyMessage = `<p class="font-bold">مدل بیش از حد شلوغ است.</p><p class="mt-2">با وجود تلاش‌های مکرر، سرور پاسخگو نبود.</p>`;
                    translationStatusMessage.innerHTML = '⚠️ مدل شلوغ است.';
                    translationStatusMessage.className = 'status-message status-incomplete';
                } else {
                    userFriendlyMessage = `<b>یک خطای پیش‌بینی‌نشده رخ داد:</b><pre class="error-pre bg-gray-900 p-2 rounded mt-2 text-xs">${escapeHTML(errorMessageText)}</pre>`;
                    translationStatusMessage.innerHTML = '❌ خطایی در ترجمه رخ داد.';
                    translationStatusMessage.className = 'status-message status-aborted';
                }

                showError(userFriendlyMessage, true); 
                const errorMsg = `خطا در پردازش فایل ${file.name}: ${error.message}`;
                addLog(errorMsg, true);
                updateFileStatus(i, "خطا", -1); 
                console.error(error);

                if (!userManuallyAborted && (error.name !== 'AbortError' && !error.message.includes("لغو شد"))) {
                    addLog("عملیات به دلیل خطا متوقف شد.", true);
                }
                break; 
            }
        } 

        isTranslating = false;
        startTranslation.classList.remove('hidden');
        stopTranslation.classList.add('hidden');
        if (uploadedFiles.length > 0) { 
             clearFileList.style.display = 'block';
        }

        if (processedFiles.length > 0) {
            downloadFiles.disabled = false;
           // addLog("عملیات کامل شد. می‌توانید فایل‌ها را دانلود کنید.", false, "green");
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
        const totalFilesCount = uploadedFiles.length; // تعریف متغیر جا افتاده
        overallProgressBar.style.width = `${(filesDone / totalFilesCount) * 100}%`;
        overallProgressLabel.textContent = `عملیات کامل شد. ${filesDone} از ${totalFilesCount} فایل پردازش شد.`;

    });

    stopTranslation.addEventListener('click', () => {
        if (abortController) {
            userManuallyAborted = true; 
            addLog("درخواست توقف عملیات...", false, "yellow");
            abortController.abort();
        }
    });

    // --- 9. ساخت فایل .ASS و دانلود (اصلاح شده) ---

                    function buildASS(originalBlocks, translatedTexts, originalFileName, dialogueData, extraBlocks) {
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
Style: Default,Vazirmatn Medium,55,&H00FFFFFF,&H0000FFFF,&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1,2,1,2,30,30,30,1
Style: OP,Vazirmatn Medium,65,&H002EFFFF,&H00FFFFFF,&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1,2.5,1.5,8,30,30,40,1
Style: ED,Vazirmatn Medium,65,&H00FFB4FF,&H00FFFFFF,&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1,2.5,1.5,2,30,30,40,1
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
        `.trim();

        let events = [];
        let lastEndTime = "0:00:00.00";

        const isKaraokeActive = document.getElementById('karaoke-toggle').checked;
        const isAiDetectionActive = document.getElementById('ai-detection-toggle').checked;

        let totalDurationSecs = 0;
        if (originalBlocks.length > 0) {
            const lastBlock = originalBlocks[originalBlocks.length - 1];
            totalDurationSecs = parseTimeToMS(lastBlock.end) / 1000;
        }

        for (let i = 0; i < originalBlocks.length; i++) {
            const block = originalBlocks[i];
            const translatedText = translatedTexts[i] || ""; 
            let positionOverride = "";
            let currentStyle = block.style || 'Default';

            if (isKaraokeActive) {
                if (isAiDetectionActive && dialogueData && dialogueData[i]) {
                    if (dialogueData[i].songType === 'OP') currentStyle = 'OP';
                    else if (dialogueData[i].songType === 'ED') currentStyle = 'ED';
                    else if (dialogueData[i].isSong) {
                         const blockStartSec = parseTimeToMS(block.start) / 1000;
                         if (blockStartSec < totalDurationSecs * 0.5) currentStyle = 'OP';
                         else currentStyle = 'ED';
                    }
                } else if (isRomajiOrKanji(block.text) || isRomajiOrKanji(translatedText)) {
                    const blockStartSec = parseTimeToMS(block.start) / 1000;
                    if (blockStartSec < totalDurationSecs * 0.3) currentStyle = 'OP';
                    else if (blockStartSec > totalDurationSecs * 0.7) currentStyle = 'ED';
                }
            }

            let assText = translatedText.replace(/\r?\n/g, '\\N');

            if (currentStyle === 'OP' || currentStyle === 'ED') {
                 if (!assText.includes('\\fad')) assText = `{\\fad(200,200)}${assText}`;
            }

            if (currentStyle === 'Default' && compareTimestamps(block.start, lastEndTime) < 0 && !assText.includes('\\an') && !assText.includes('\\pos')) {
                positionOverride = "{\\an8}"; 
            }
            lastEndTime = block.end;

            const layer = block.layer || '0';
            const name = block.name || '';
            const marginL = block.marginL || '0';
            const marginR = block.marginR || '0';
            const marginV = block.marginV || '0';
            const effect = block.effect || '';

            const originalRawText = block.text.replace(/<[^>]+>/g, '');

            // ---> استخراج تگ‌های موقعیت‌یاب کلی و انتقال به ابتدای خط <---
            if (originalRawText && (originalRawText.includes('{') || originalRawText.includes('}'))) {
                 // فقط تگ‌های \an1 تا \an9 و \pos(x,y) را می‌گیرد
                const positionTags = originalRawText.match(/\{\\an\d\}|\{\\pos\([^)]+\)\}/g) || [];
                if (positionTags.length > 0) {
                    assText = positionTags.join('') + assText;
                }
            }

            if (positionOverride) {
                // اگر از قبل تگ موقعیت ندارد، آن را اضافه کن
                if (!assText.includes('\\an') && !assText.includes('\\pos')) {
                    if (assText.startsWith('{') && assText.includes('}')) assText = `{\\an8${assText.substring(1)}`;
                    else assText = `{\\an8}${assText}`;
                }
            }

            events.push(`Dialogue: ${layer},${block.start},${block.end},${currentStyle},${name},${marginL},${marginR},${marginV},${effect},${assText}`);
        }

        // اضافه کردن متون واترمارک دلخواه
        if (extraBlocks) {
            for (const b of extraBlocks) {
                let assText = b.text.replace(/\r?\n/g, '\\N');
                events.push(`Dialogue: 0,${b.start},${b.end},Default,,0,0,0,,{\\an8}${assText}`);
            }
        }

        return header + '\n' + events.join('\n');
    }

    function buildSRT(originalBlocks, translatedTexts, extraBlocks) {
        let allBlocks = [];
        
        // وارد کردن تمامی بلاک‌های اصلی به لیست جدید
        for (let i = 0; i < originalBlocks.length; i++) {
            const text = translatedTexts[i] || "";
            const cleanText = text.replace(/\r?\n/g, '\r\n');
            allBlocks.push({
                startMs: parseTimeToMS(originalBlocks[i].start),
                endMs: parseTimeToMS(originalBlocks[i].end),
                text: cleanText
            });
        }
        
        // وارد کردن بلاک‌های واترمارک (در صورت وجود)
        if (extraBlocks) {
            for (const b of extraBlocks) {
                allBlocks.push({
                    startMs: parseTimeToMS(b.start),
                    endMs: parseTimeToMS(b.end),
                    text: b.text.replace(/\r?\n/g, '\r\n')
                });
            }
        }
        
        // مرتب‌سازی زمانی دقیق برای SRT (بسیار مهم تا پلیرها قاطی نکنند)
        allBlocks.sort((a, b) => a.startMs - b.startMs);

        let srtOutput = '';
        for (let i = 0; i < allBlocks.length; i++) {
            const block = allBlocks[i];
            const startTime = msToSrtTime(block.startMs);
            const endTime = msToSrtTime(block.endMs);
            srtOutput += `${i + 1}\r\n${startTime} --> ${endTime}\r\n${block.text}\r\n\r\n`;
        }
        return srtOutput.trim();
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
        const logEntry = document.createElement('div');
        if (isError) logEntry.className = 'text-red-600 dark:text-red-400';
        else if (color === 'green') logEntry.className = 'text-emerald-600 dark:text-green-400';
        else if (color === 'yellow') logEntry.className = 'text-amber-600 dark:text-yellow-400';
        else logEntry.className = 'text-slate-600 dark:text-gray-300';
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

});