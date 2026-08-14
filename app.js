import {
    maskTags, unmaskTags, cleanAIOutput, countTagPlaceholders,
    extractTranslationsFromAIResponse, isTranslationHealthy,
    escapeHTML, containsJapaneseScript, isRomajiOrKanji,
    parseTimeToMS, msToASS, msToSrtTime, robustAssSplit,
    parseSRT, parseVTT, parseASS, cleanAssToSrt,
    processAssForTranslationAndMapping, rebuildAssFromTranslation,
    sortAssDialogueLines, timeToFrames, compareTimestamps
} from './subtitle-core.js';

document.addEventListener('DOMContentLoaded', () => {

    // --- 0. توابع کمکی (جدید: ماسک کردن تگ‌ها و مدیریت پرامپت) ---
    // توجه: maskTags/unmaskTags/cleanAIOutput/countTagPlaceholders/
    // extractTranslationsFromAIResponse/isTranslationHealthy/escapeHTML/
    // containsJapaneseScript/isRomajiOrKanji به subtitle-core.js منتقل شدند
    // (توابع خالصی که برای تست خودکار هم استفاده می‌شوند). این فایل باید
    // قبل از app.js در index.html لود شود.

    // --- [NEW] Storage Manager Functions for Resume Capability ---
    const STORAGE_KEY_PREFIX = 'anime_sub_resume_data_';

    function getFileId(file) {
        return `${file.name}_${file.size}`;
    }

    function saveProgress(fileId, map) {
        try {
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
    // --- 1. انتخاب عناصر HTML ---
    const apiKeyInput = document.getElementById('apiKey');
    const apiKeyLockIcon = document.getElementById('apiKeyLockIcon'); 
    const modelSelect = document.getElementById('modelSelect');
    const fpsInput = document.getElementById('fpsInput');

    const creativityRange = document.getElementById('creativityRange');
    const creativityValue = document.getElementById('creativityValue');
    const topPRange = document.getElementById('topPRange'); 
    const topPValue = document.getElementById('topPValue'); 
    const toneSelect = document.getElementById('toneSelect');
    const startTextEnabled = document.getElementById('startTextEnabled');
    const startTextInput = document.getElementById('startTextInput');
    const startTextStartTime = document.getElementById('startTextStartTime');
    const startTextEndTime = document.getElementById('startTextEndTime');
    const endTextEnabled = document.getElementById('endTextEnabled');
    const endTextInput = document.getElementById('endTextInput');
    const endTextStartFromEnd = document.getElementById('endTextStartFromEnd');
    const endTextDuration = document.getElementById('endTextDuration');

    const helpButtons = document.querySelectorAll('.help-btn');

    const systemPrompt = document.getElementById('systemPrompt');
    const promptSelector = document.getElementById('promptSelector');
    const addPromptBtn = document.getElementById('addPromptBtn');
    const deletePromptBtn = document.getElementById('deletePromptBtn');
    const promptReadOnlyMsg = document.getElementById('promptReadOnlyMsg');

    const resetSettings = document.getElementById('resetSettings'); 
    const settingsReset = document.getElementById('settingsReset'); 

    const exportSettingsBtn = document.getElementById('exportSettingsBtn');
    const importSettingsBtn = document.getElementById('importSettingsBtn');
    const importSettingsFile = document.getElementById('importSettingsFile');
    const settingsImported = document.getElementById('settingsImported');
    const exportApiKeyModal = document.getElementById('exportApiKeyModal');
    const exportWithApiKeyBtn = document.getElementById('exportWithApiKeyBtn');
    const exportWithoutApiKeyBtn = document.getElementById('exportWithoutApiKeyBtn');
    const cancelExportBtn = document.getElementById('cancelExportBtn');


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
    const karaokeToggle = document.getElementById('karaoke-toggle'); 
    const aiDetectionToggle = document.getElementById('ai-detection-toggle'); 
    const liveOutputToggle = document.getElementById('live-output-toggle'); 
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
    let saveProgressTimeout = null; 

    let styleFormatFields = ['Name', 'Fontname', 'Fontsize', 'PrimaryColour', 'SecondaryColour', 'OutlineColour', 'BackColour', 'Bold', 'Italic', 'Underline', 'StrikeOut', 'ScaleX', 'ScaleY', 'Spacing', 'Angle', 'BorderStyle', 'Outline', 'Shadow', 'Alignment', 'MarginL', 'MarginR', 'MarginV', 'Encoding'];

        const defaultPromptText = `
<Role>
You are an expert, native Persian anime translator and localization specialist. Your task is to translate subtitles from English (or Japanese romaji) into flawless, natural, and engaging Persian. Your goal is to make the audience feel as if the dialogue was originally written by a master Persian scriptwriter, perfectly capturing the anime's mood, character personalities, and cultural nuances.
</Role>

<Input_Format>
You will receive lines in the following format: [ID:n]{start}{end}Text
Example: [ID:12]{100}{200}Hello there!
The text may contain placeholders like ___TAG_0___ representing styling, colors, or positioning.
</Input_Format>

<Critical_Rules>
1. FORMAT PRESERVATION (CRITICAL): You MUST preserve the exact ID and timing tags at the absolute beginning of each translated line without any extra spaces. Example of correct output: [ID:12]{100}{200}سلام!
   - NEVER merge lines.
   - NEVER skip a line. Every single line must be translated and returned.
2. STYLE TAGS (___TAG_n___): NEVER translate, modify, or invent these tags. Place them exactly adjacent to the Persian equivalent of the word they were attached to in English.
3. BRACKETED TEXT [...] MANAGEMENT:
   - DELETE: If the bracket contains a speaker's name or a sound effect/reaction (e.g., [gasps], [sighs], [Kyoichiro]), remove it completely from the output.
   - TRANSLATE & KEEP: If the bracket contains meaningful story elements (e.g., skill names, items, titles, system messages like [Level Up] or [Petty Pickpocket]), translate the text inside and KEEP the brackets in the output.
4. NO HALLUCINATIONS: Translate exactly what is there. Do not invent dialogues, actions, or words that do not exist in the source.
</Critical_Rules>

<Localization_And_Style_Guidelines>
1. PROPER NOUNS & TRANSLITERATION: Do not translate character names literally (e.g., "Snow" remains "اسنو", not "برف"). However, meaningful titles (e.g., "The Black Swordsman") must be translated (شمشیرزن سیاه).
2. JAPANESE HONORIFICS: Keep Japanese honorifics (-kun, -san, -sama, -chan, -dono) and familial terms (Onii-san, Onee-chan) exactly as they sound, written in Persian script (e.g., سان، کون، چان، اونی-سان). Do not translate them to "Brother" or "Sister".
3. GENDER & PRONOUN CONTEXT: Persian is gender-neutral (او). Pay strict attention to the context of previous lines to ensure male/female speakers and subjects/objects are not confused.
4. IDIOMS, SLANG, & WORDPLAY (CRUCIAL):
   - NEVER translate idioms, jokes, or slang literally. Find the exact natural equivalent in Persian street language or culture.
   - Do not invent non-existent Persian words (e.g., translate "Unemployed bum" naturally as "علاف بیکار").
   - If there is wordplay or rhyming (e.g., "pure piss / pure bliss"), recreate the comedic effect and rhyme using appropriate Persian words.
5. TONE & CHARACTERIZATION (NO CENSORSHIP):
   - Delinquents/Casual: Use heavy colloquial Persian, street slang, and broken words (e.g., "می‌خوام", "نمی‌تونم").
   - Royals/Historical: Use epic, polite, and formal literary Persian.
   - NO CENSORSHIP: Swear words, sexual innuendos, violence, and insults MUST be translated with the exact same intensity as the original. Do not sanitize the text.
6. INCOMPLETE SENTENCES: If a line ends with a dash (-) or ellipses (...), the Persian translation MUST also remain incomplete. Do not attempt to finish the sentence.
7. SONG LYRICS (OP/ED): Translate lines containing musical notes (♪, ♫) or obvious song lyrics with a poetic, rhythmic, and epic tone.
</Localization_And_Style_Guidelines>

<Output_Format>
Return ONLY the translated lines.
DO NOT include any introductions, conclusions, translator notes, or markdown code blocks (like \`\`\`json or \`\`\`text). Output raw text only.
</Output_Format>
`.trim();

    // مدیریت پرامپت‌ها
    let customPrompts = []; 
    let currentPromptId = 'default';

    // --- مدیریت UI و اعتبارسنجی API ---

    function updateSliderBackground(slider) {
        const min = parseFloat(slider.min);
        const max = parseFloat(slider.max);
        const val = parseFloat(slider.value);
        const percentage = ((val - min) / (max - min)) * 100;
        slider.style.background = `linear-gradient(to left, #374151 calc(100% - ${percentage}%), #3b82f6 calc(100% - ${percentage}%))`;
    }

    creativityRange.addEventListener('input', (e) => {
        creativityValue.textContent = e.target.value;
        updateSliderBackground(e.target);
    });

    topPRange.addEventListener('input', (e) => {
        topPValue.textContent = e.target.value;
        updateSliderBackground(e.target);
    });

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

    apiKeyInput.addEventListener('input', (e) => {
        updateApiKeyLock(e.target.value);
    });

    helpButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const targetId = btn.getAttribute('data-target');
            const tooltip = document.getElementById(targetId);

            document.querySelectorAll('.help-tooltip').forEach(t => {
                if (t !== tooltip) t.classList.remove('show');
            });

            tooltip.classList.toggle('show');
        });
    });

    document.addEventListener('click', () => {
        document.querySelectorAll('.help-tooltip').forEach(t => {
            t.classList.remove('show');
        });
    });

    function loadSettings() {
        try {
            const savedPrompts = localStorage.getItem('customPrompts');
            customPrompts = savedPrompts ? JSON.parse(savedPrompts) : [];
        } catch (e) {
            customPrompts = [];
        }

        currentPromptId = localStorage.getItem('selectedPromptId') || 'default';

        if (currentPromptId !== 'default' && !customPrompts.find(p => p.id === currentPromptId)) {
            currentPromptId = 'default';
        }

        const key = localStorage.getItem('geminiApiKey') || '';
        apiKeyInput.value = key;
        updateApiKeyLock(key); 

        modelSelect.value = localStorage.getItem('geminiModel') || 'gemini-3.6-flash';
        fpsInput.value = localStorage.getItem('subtitleFPS') || '23.976';
        proxyToggle.checked = localStorage.getItem('proxyEnabled') === 'true';
        karaokeToggle.checked = localStorage.getItem('karaokeEnabled') !== 'false'; 
        aiDetectionToggle.checked = localStorage.getItem('aiDetectionEnabled') === 'true'; 
        liveOutputToggle.checked = localStorage.getItem('liveOutputEnabled') !== 'false'; 
        if (thinkingModeToggle) thinkingModeToggle.checked = localStorage.getItem('thinkingModeEnabled') !== 'false';

        creativityRange.value = localStorage.getItem('geminiTemperature') || '0.4';
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

        const defaultOpt = document.createElement('option');
        defaultOpt.value = 'default';
        defaultOpt.textContent = 'پرامت پیش فرض';
        promptSelector.appendChild(defaultOpt);

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
            systemPrompt.disabled = true; 
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

    function syncCurrentPromptContent() {
        if (currentPromptId !== 'default') {
            const index = customPrompts.findIndex(p => p.id === currentPromptId);
            if (index !== -1) {
                customPrompts[index].content = systemPrompt.value;
            }
        }
    }

    promptSelector.addEventListener('change', (e) => {
        syncCurrentPromptContent(); 
        currentPromptId = e.target.value;
        updatePromptUI();
        autoSaveSettings(); 
    });

    addPromptBtn.addEventListener('click', () => {
        const name = prompt("نام پرامپت جدید را وارد کنید:");
        if (name && name.trim()) {
            syncCurrentPromptContent(); 

            const newId = 'custom_' + Date.now();
            customPrompts.push({
                id: newId,
                name: name.trim(),
                content: '' 
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

    function autoSaveSettings() {
        localStorage.setItem('geminiApiKey', apiKeyInput.value);
        localStorage.setItem('geminiModel', modelSelect.value);
        localStorage.setItem('subtitleFPS', fpsInput.value);
        localStorage.setItem('proxyEnabled', proxyToggle.checked);
        localStorage.setItem('karaokeEnabled', karaokeToggle.checked);
        localStorage.setItem('aiDetectionEnabled', aiDetectionToggle.checked);
        localStorage.setItem('liveOutputEnabled', liveOutputToggle.checked);
        if (thinkingModeToggle) localStorage.setItem('thinkingModeEnabled', thinkingModeToggle.checked);

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

        syncCurrentPromptContent();

        localStorage.setItem('customPrompts', JSON.stringify(customPrompts));
        localStorage.setItem('selectedPromptId', currentPromptId);

        saveSafetySettings();
    }

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

        currentPromptId = 'default';
        updatePromptUI();

        proxyToggle.checked = false; 
        karaokeToggle.checked = true;
        aiDetectionToggle.checked = false;
        liveOutputToggle.checked = true;
        if (thinkingModeToggle) thinkingModeToggle.checked = true;

        safetyHarassmentToggle.checked = false;
        safetyHateSpeechToggle.checked = false;
        safetySexuallyExplicitToggle.checked = false;
        safetyDangerousContentToggle.checked = false;

        fpsInput.value = '23.976'; 

        creativityRange.value = '0.4'; 
        creativityValue.textContent = '0.4';
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

        autoSaveSettings();

        settingsReset.classList.remove('hidden');
        setTimeout(() => settingsReset.classList.add('hidden'), 3000);
    });

    // =====================================================================
    // --- خروجی/ورودی گرفتن از کل تنظیمات (پشتیبان‌گیری) ---
    //
    // اصل طراحی: به‌جای لیست‌کردن دستی هر تنظیم، همه‌ی کلیدهای localStorage
    // (به‌جز کش پیشرفت هر فایل که مخصوص خودِ آن فایل است) عیناً خوانده و در
    // فایل خروجی قرار می‌گیرند. این یعنی هر تنظیم/دکمه‌ی جدیدی که در آینده
    // به برنامه اضافه شود و از localStorage استفاده کند، خودکار وارد
    // اکسپورت‌های جدید می‌شود؛ و هنگام وارد کردن یک فایل قدیمی‌تر، تنظیماتی
    // که آن فایل نداشته دست‌نخورده باقی می‌مانند (فقط merge می‌شود، نه پاک‌سازی کامل).
    // =====================================================================

    function collectAllSettingsForExport() {
        const settings = {};
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (!key || key.startsWith(STORAGE_KEY_PREFIX)) continue; // کش پیشرفتِ هر فایل، جزو «تنظیمات» نیست
            settings[key] = localStorage.getItem(key);
        }
        return settings;
    }

    function triggerJSONDownload(dataObj, filename) {
        const blob = new Blob([JSON.stringify(dataObj, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 2000);
    }

    function finalizeExport(includeApiKey) {
        // قبل از خروجی گرفتن، هر تغییری که هنوز روی فیلدها هست ولی ذخیره نشده رو ذخیره می‌کنیم
        syncCurrentPromptContent();
        autoSaveSettings();
        saveSafetySettings();

        const settings = collectAllSettingsForExport();
        if (!includeApiKey) {
            settings.geminiApiKey = ''; // به‌جای حذف کامل، خالی می‌ذاریم تا ایمپورت بفهمه عمداً خالی گذاشته شده
        }

        const exportPayload = {
            appName: 'anime-subtitle-translator-settings',
            formatVersion: 1,
            exportedAt: new Date().toISOString(),
            settings: settings
        };

        const dateStr = new Date().toISOString().slice(0, 10);
        triggerJSONDownload(exportPayload, `تنظیمات-مترجم-زیرنویس-${dateStr}.json`);

        exportApiKeyModal.classList.add('hidden');
        exportApiKeyModal.style.display = 'none';

        addLog(includeApiKey ? "فایل خروجی تنظیمات (همراه با کلید API) با موفقیت دانلود شد." : "فایل خروجی تنظیمات (بدون کلید API) با موفقیت دانلود شد.", false, "green");
    }

    exportSettingsBtn.addEventListener('click', () => {
        const hasApiKey = !!(localStorage.getItem('geminiApiKey') || '').trim();

        if (!hasApiKey) {
            // چیزی برای پرسیدن نیست، مستقیم خروجی می‌گیریم
            finalizeExport(false);
            return;
        }

        exportApiKeyModal.classList.remove('hidden');
        exportApiKeyModal.style.display = 'flex';
        requestAnimationFrame(() => {
            exportApiKeyModal.classList.add('opacity-100');
            exportApiKeyModal.querySelector('div').classList.remove('scale-95');
            exportApiKeyModal.querySelector('div').classList.add('scale-100');
        });
    });

    function closeExportApiKeyModal() {
        exportApiKeyModal.classList.remove('opacity-100');
        exportApiKeyModal.querySelector('div').classList.remove('scale-100');
        exportApiKeyModal.querySelector('div').classList.add('scale-95');
        setTimeout(() => {
            exportApiKeyModal.style.display = 'none';
            exportApiKeyModal.classList.add('hidden');
        }, 300);
    }

    exportWithApiKeyBtn.addEventListener('click', () => finalizeExport(true));
    exportWithoutApiKeyBtn.addEventListener('click', () => finalizeExport(false));
    cancelExportBtn.addEventListener('click', closeExportApiKeyModal);

    importSettingsBtn.addEventListener('click', () => {
        importSettingsFile.value = ''; // تا انتخاب دوباره‌ی همون فایل هم رویداد change رو فعال کنه
        importSettingsFile.click();
    });

    importSettingsFile.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (evt) => {
            let parsed;
            try {
                parsed = JSON.parse(evt.target.result);
            } catch (err) {
                showError("فایل انتخاب‌شده یک JSON معتبر نیست. لطفاً فایلی که از همین بخش خروجی گرفته‌اید را انتخاب کنید.");
                return;
            }

            // پشتیبانی از فرمت فعلی ({ settings: {...} }) و همچنین یک فایل خام key/value
            // برای مقاومت در برابر تغییرات احتمالی فرمت در آینده
            const importedSettings = (parsed && typeof parsed === 'object' && parsed.settings && typeof parsed.settings === 'object')
                ? parsed.settings
                : (parsed && typeof parsed === 'object' ? parsed : null);

            if (!importedSettings) {
                showError("محتوای فایل قابل شناسایی نیست. این فایل مربوط به بخش پشتیبان‌گیری تنظیمات همین برنامه نیست.");
                return;
            }

            const existingApiKey = localStorage.getItem('geminiApiKey') || '';
            let importedCount = 0;

            Object.keys(importedSettings).forEach(key => {
                if (key.startsWith(STORAGE_KEY_PREFIX)) return; // این فایل نباید کش پیشرفت فایل‌ها رو دستکاری کنه

                const value = importedSettings[key];

                if (key === 'geminiApiKey') {
                    // اگر فایل ورودی کلید نداشت (خالی/جامانده) و کاربر از قبل کلیدی وارد کرده،
                    // همون کلید فعلی دست‌نخورده می‌مونه و پاک نمی‌شه.
                    if (!value && existingApiKey) return;
                    if (!value) return; // چیزی برای ست‌کردن نیست
                }

                localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
                importedCount++;
            });

            // بازخوانی کامل رابط کاربری از روی localStorage به‌روزشده
            loadSettings();
            syncOutputFormatHighlight();

            settingsImported.classList.remove('hidden');
            setTimeout(() => settingsImported.classList.add('hidden'), 3000);

            addLog(`تنظیمات با موفقیت از فایل پشتیبان بازیابی شد (${importedCount} مورد اعمال شد).`, false, "green");
        };

        reader.onerror = () => {
            showError("خطا در خواندن فایل. لطفاً دوباره تلاش کنید.");
        };

        reader.readAsText(file);
    });

    // --- 4. مدیریت آپلود فایل ---
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
            if (file.size > 50 * 1024 * 1024) { 
                showError(`فایل "${escapeHTML(file.name)}" (${(file.size / 1024 / 1024).toFixed(1)}MB) از حد مجاز 50MB حجیم‌تر است و نادیده گرفته شد.`);
                return false;
            }
            return true;
        });

        if (newFiles.length === 0) return;

        uploadedFiles.push(...newFiles);

        if (uploadedFiles.length > 0) {
            updateFileListUI();
            clearFileList.style.display = 'block';

            outputFormatSelector.style.display = 'block';

            if (!isTranslating) {
                startTranslation.disabled = false;
                downloadFiles.disabled = true;
                processedFiles = []; 
            }
        }
    }

    function updateFileListUI() {
        uploadedFiles.forEach((file, index) => {
            const elementId = `file-${index}`;
            if (document.getElementById(elementId)) return; 

            const fileElement = document.createElement('div');
            fileElement.id = elementId;
            fileElement.className = 'bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center justify-between transition-colors';
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

        let safeProgress = progress;
        if (safeProgress > 100) safeProgress = 100;

        if (progressEl && safeProgress >= 0) progressEl.style.width = `${safeProgress}%`;

        const totalFiles = uploadedFiles.length;
        const fileProgress = safeProgress < 0 ? 0 : (safeProgress / 100); 
        const filesDone = processedFiles.length;

        let overallProgress = ((filesDone + fileProgress) / totalFiles) * 100;

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
        syncOutputFormatHighlight(); 
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

    // --- 5. توابع پارسر ---
    // parseTimeToMS/msToASS/msToSrtTime/robustAssSplit/parseSRT/parseVTT/
    // parseASS/cleanAssToSrt/processAssForTranslationAndMapping/
    // rebuildAssFromTranslation/sortAssDialogueLines به subtitle-core.js
    // منتقل شدند.

        async function finalizeAssFile(assContent) {
        try {
            // ۱. لود کردن فایل فونت شما
            const fontResponse = await fetch('./fontVazirmatn.txt'); 
            if (!fontResponse.ok) throw new Error('فایل فونت (fontVazirmatn.txt) پیدا نشد.');
            const fontData = await fontResponse.text();

            const lines = assContent.split(/\r?\n/);
            const newLines = [];
            let inStylesSection = false;
            let inEventsSection = false;
            let inFontsSection = false;

            let fontNameIndex = 1; 
            let styleFormatFields = ['Name', 'Fontname', 'Fontsize', 'PrimaryColour', 'SecondaryColour', 'OutlineColour', 'BackColour', 'Bold', 'Italic', 'Underline', 'StrikeOut', 'ScaleX', 'ScaleY', 'Spacing', 'Angle', 'BorderStyle', 'Outline', 'Shadow', 'Alignment', 'MarginL', 'MarginR', 'MarginV', 'Encoding'];

            const fnTagRegex = /\\fn[^\\}]+/g;
            const fspTagRegex = /\\fsp-?\d+/g;

            for (const line of lines) {
                let currentLine = line;
                const trimmedLine = line.trim().toLowerCase();

                // تشخیص بخش‌های مختلف فایل ASS
                if (trimmedLine === '[v4+ styles]') {
                    inStylesSection = true; inEventsSection = false; inFontsSection = false;
                } else if (trimmedLine === '[events]') {
                    inStylesSection = false; inEventsSection = true; inFontsSection = false;
                } else if (trimmedLine.startsWith('[fonts]')) { 
                    inStylesSection = false; inEventsSection = false; inFontsSection = true;
                } else if (trimmedLine.startsWith('[')) {
                    inStylesSection = false; inEventsSection = false; inFontsSection = false;
                }

                // خروج قطعی از بخش فونت در صورت رسیدن به دیالوگ (جلوگیری از باگ ناپدید شدن متن)
                if (trimmedLine.startsWith('dialogue:')) {
                    inFontsSection = false;
                    inEventsSection = true;
                }

                // پیدا کردن جایگاه نام فونت در استایل‌ها
                if (inStylesSection && trimmedLine.startsWith('format:')) {
                    styleFormatFields = trimmedLine.substring(7).trim().split(',').map(f => f.trim());
                    const index = styleFormatFields.map(f => f.toLowerCase()).indexOf('fontname');
                    if (index > -1) {
                        fontNameIndex = index;
                    }
                }

                // جایگذاری نام فونت شما در تمام استایل‌ها
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
                    // حذف فونت‌های قدیمی: 
                    // برنامه خطوط فونت قدیمی رو می‌بینه ولی اونا رو وارد فایل جدید نمی‌کنه
                    continue; 
                }

                newLines.push(currentLine);
            }

            let finalContent = newLines.join('\r\n');

            // ۲. چسباندن امنِ فونت شما به انتهای فایل
            finalContent += '\r\n\r\n[Fonts]\r\n' + fontData;

            return finalContent;
        } catch (error) {
            console.error("خطا در نهایی‌سازی ASS:", error);
            // در صورت بروز خطا، فایل رو بدون فونت میده بیرون تا حداقل دیالوگ‌ها از بین نرن
            return assContent; 
        }
    }

    // --- 6. توابع API و مدیریت خطا ---

    // timeToFrames به subtitle-core.js منتقل شد.

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

    async function detectSongsWithAI(dialogueData, fps, apiKey, model) {
        if (!dialogueData || dialogueData.length === 0) return null;

        const totalLines = dialogueData.length;
        const lastFrame = dialogueData[totalLines - 1].endFrame;
        const totalSeconds = lastFrame / fps;

        const tenMinutesInFrames = 600 * fps;

        let candidateLines = [];

        if (totalSeconds < 1200) { 
            candidateLines = dialogueData.map(d => ({ index: d.i, time: `{${d.startFrame}}-{${d.endFrame}}`, text: d.cleanText }));
        } else {
            const startCutoff = tenMinutesInFrames;
            const endCutoff = lastFrame - tenMinutesInFrames;

            candidateLines = dialogueData.filter(d => {
                return d.startFrame < startCutoff || d.startFrame > endCutoff;
            }).map(d => ({ index: d.i, time: `{${d.startFrame}}-{${d.endFrame}}`, text: d.cleanText }));
        }

        if (candidateLines.length === 0) return null;

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

    async function performSelfCorrection(texts, fileIndex, model, apiKey, prompt, masterTranslationMap, fileId, isAlreadyFullyTranslated = false, orderedIds = null, originalTagCountById = null) {

        const foreignScriptRegex = /[\u0400-\u04FF\u0370-\u03FF\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF\uAC00-\uD7AF\u0E00-\u0E7F\u0900-\u097F\u0980-\u09FF\u0B80-\u0BFF\u0C00-\u0C7F\u0590-\u05FF]/;
        const englishRegex = /[a-zA-Z]/;
        const badCharacterRegex = /[\u0000-\u001F\u007F-\u009F\uFFFD\u061C]/;

        let linesToRetry = [];
        let tagMismatchCount = 0;
        for (let i = 0; i < texts.length; i++) {
            if (typeof texts[i] !== 'string') continue; 
            const textPart = (texts[i].match(/\{(\d+)\}\{(\d+)\}(.*)/) || [])[3] || '';
            const textForCheck = textPart.replace(/___TAG_\d+___/g, '').replace(/\{[^}]+\}/g, ' ').trim();

            if (!textForCheck) continue; 

            // شناسه‌ی خط دقیقاً از روی هم‌ترازی ایندکس گرفته می‌شود، نه با جستجوی
            // معکوسِ متن داخل map (که اگر دو خط متن یکسان داشتند اشتباه می‌کرد).
            const realId = (orderedIds && orderedIds[i] !== undefined) ? orderedIds[i] : -1;

            let needsCorrection = false;
            if (badCharacterRegex.test(textForCheck) || englishRegex.test(textForCheck)) {
                needsCorrection = true;
            } else if (foreignScriptRegex.test(textForCheck)) {
                if (!/[♪♡♫♬]/.test(textForCheck)) {
                    needsCorrection = true; 
                }
            }

            // بررسی سلامت تگ‌های استایل: اگر AI تگی را گم یا اضافه کرده باشد،
            // حتی اگر متن از نظر زبانی درست به‌نظر برسد، این خط خراب محسوب می‌شود.
            if (!needsCorrection && originalTagCountById && realId !== -1) {
                const expectedTags = originalTagCountById.get(realId) || 0;
                const actualTags = countTagPlaceholders(textPart);
                if (expectedTags !== actualTags) {
                    needsCorrection = true;
                    tagMismatchCount++;
                }
            }

                       if (needsCorrection) {
                linesToRetry.push({ index: i, text: textPart, originalId: realId });
            } 
        }

        if (linesToRetry.length === 0) {
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

            const promptText = `The following JSON array contains subtitle lines that need correction.
CRITICAL INSTRUCTION: You MUST translate ALL English words to Persian. DO NOT leave any English text (a-z, A-Z) in the output. If it's a specific name or sign like "CLEVATESS", you MUST transliterate it to Persian characters (e.g., کلواتسس).
If a line contains \`___TAG_n___\` placeholders, you MUST preserve them exactly in the output.
You must return a **Valid JSON Array of Objects**, where each object has the SAME "id" as the input, and a "text" field with the translation.
Example: [{"id": 0, "text": "متن کاملاً فارسی"}]

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

        const rawTemp = parseFloat(creativityRange.value);
        const temperature = isNaN(rawTemp) ? 0.2 : rawTemp; // 0 دمای معتبریه، نباید با || جایگزین بشه
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
                                  errorMessage.includes('high demand') || 
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

    // --- 8. منطق اصلی ترجمه ---

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

            const rawTemp = parseFloat(creativityRange.value);
            const temperature = isNaN(rawTemp) ? 0.2 : rawTemp; // 0 دمای معتبریه، نباید با || جایگزین بشه
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

        async function translateChunk(content, customPrompt, fileName, progressStart, progressEnd, fileIndex, accumulatedMap, fileId) {
            if (!content.trim()) return '';
            updateFileStatus(fileIndex, `در حال آپلود (${fileName})...`, progressStart);

            const apiKey = apiKeyInput.value.trim();

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

            let thinkingTimer = setInterval(() => {
                const elapsedTime = ((Date.now() - thinkingStartTime) / 1000).toFixed(1);
                const thinkingMsg = baseThinkingText + `${elapsedTime} ثانیه`;
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
                                if (thinkingTimer) { 
                                    clearInterval(thinkingTimer); 
                                    thinkingTimer = null; 
                                    addLog("تفکر هوش مصنوعی به پایان رسید در حال دریافت ترجمه", false, "green");
                                }

                                if (isFirstChunk) { 
                                    if (liveOutputToggle.checked) liveOutput.textContent = ''; 
                                    isFirstChunk = false; 
                                }

                                const lines = currentFullText.split('\n');
                                                                const extractedTexts = lines
                                    .map(line => {
                                        // خط آخرِ استریم معمولاً هنوز کامل نشده، پس رگکس اجازه می‌دهد
                                        // آکولادهای زمانی هرچیزی باشند یا حتی جا بیفتند؛ این محتوا
                                        // در هر صورت هرگز برای زمان‌بندی استفاده نمی‌شود.
                                        const match = line.match(/^\[ID:\s*(\d+)\]\s*(?:\{[^}]*\}\s*){0,2}(.*)$/i);
                                        if (match) {
                                            let text = match[2] != null ? match[2].trim() : '';
                                            
                                            // جلوگیری از نمایش لحظه‌ای کدهای زمانی ناقص (مثل {100) در حین استریم
                                            text = text.replace(/^\{[^}]*$/, '').trim();

                                            // متن خالی یعنی این خط هنوز کامل استریم نشده یا AI چیزی
                                            // برنگردانده؛ آن را به‌عنوان ترجمه‌ی نهایی ثبت نمی‌کنیم تا
                                            // به‌اشتباه "کامل" تلقی نشود و بی‌صدا خالی نماند.
                                            if (accumulatedMap && text) {
                                                const id = parseInt(match[1], 10);
                                                accumulatedMap.set(id, text);

                                                if (saveProgressTimeout) clearTimeout(saveProgressTimeout);
                                                saveProgressTimeout = setTimeout(() => {
                                                    saveProgress(fileId, accumulatedMap);
                                                }, 1500);
                                            }
                                            return text || null;
                                        }
                                        return null;
                                    })
                                    .filter(text => text !== null);

                                                                if (liveOutputToggle.checked) {
                                    liveOutput.style.display = 'block';
                                    const displayText = extractedTexts.join('\n').replace(/\|/g, '\n')
                                        // فیلتر کردن هوشمند تگ‌های کامل و ناقص در حین دریافت استریم
                                        .replace(/___[a-zA-Z0-9_]*/g, '');
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
                                      errorMessage.includes('high demand') || 
                                      errorMessage.includes('503') || 
                                      errorMessage.includes('524') ||
                                      errorMessage.includes('networkerror');

                    if (isRetryable && attempt <= MAX_ATTEMPTS) {
                         addLog(`خطای شلوغی در ترجمه اصلی (تلاش ${attempt} از ${MAX_ATTEMPTS}). ${RETRY_DELAY/1000} ثانیه صبر می‌کنیم...`, false, "yellow");
                         updateFileStatus(fileIndex, `تلاش مجدد ${attempt}...`, progressStart);
                         await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));

                         thinkingStartTime = Date.now();

                         if (!thinkingTimer) {
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

        for (let i = 0; i < uploadedFiles.length; i++) {
            const file = uploadedFiles[i];
            const apiKey = apiKeyInput.value.trim();
            const model = modelSelect.value;
            const prompt = systemPrompt.value;

            const fileId = getFileId(file);
            let masterTranslationMap = loadProgress(fileId);

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
                        cleanText = block.text.replace(/\{[^}]+\}/g, ' ').trim();
                    }

                    const microLine = `{${startFrame}}{${endFrame}}${cleanText.replace(/\n/g, '|')}`;
                    return { i, microLine, cleanText, startFrame, endFrame, block, isSong: false, songType: null };
                });

                let jpCount = 0;
                dialogueData.forEach(d => {
                    if (containsJapaneseScript(d.cleanText)) jpCount++;
                });
                const isJapaneseSource = jpCount > (dialogueData.length * 0.3);
                if (isJapaneseSource) {
                    addLog("زبان مبدأ ژاپنی تشخیص داده شد.", false, "blue");
                }

                if (aiDetectionToggle.checked) {
                    addLog('در حال اسکن هوشمند ۱۰ دقیقه ابتدا و انتها برای یافتن آهنگ...', false, "yellow");
                    updateFileStatus(i, "اسکن هوشمند آهنگ...", 5);

                    const songIndices = await detectSongsWithAI(dialogueData, fps, apiKey, model);

                    if (songIndices) {
                        let opCount = 0;
                        let edCount = 0;

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
                            addLog("هوش مصنوعی هیچ آهنگی پیدا نکرد. استفاده از روش جایگزین...", false, "yellow");
                            dialogueData.forEach(d => {
                                if (isJapaneseSource) {
                                    if (/[♪♡♫♬]/.test(d.cleanText)) d.isSong = true;
                                } else {
                                    if (isRomajiOrKanji(d.cleanText)) d.isSong = true;
                                }
                            });
                        }
                    } else {
                         addLog("خطا در اسکن هوشمند یا نتیجه خالی. استفاده از روش جایگزین...", false, "yellow");
                         dialogueData.forEach(d => {
                             if (isJapaneseSource) {
                                 if (/[♪♡♫♬]/.test(d.cleanText)) d.isSong = true;
                             } else {
                                 if (isRomajiOrKanji(d.cleanText)) d.isSong = true;
                             }
                         });
                    }

                } else {
                    dialogueData.forEach(d => {
                        if (isJapaneseSource) {
                             if (/[♪♡♫♬]/.test(d.cleanText)) d.isSong = true;
                        } else {
                             if (isRomajiOrKanji(d.cleanText)) d.isSong = true;
                        }
                    });
                }

                let fullMicroDVD = '';
                let linesObjArray = [];

                if (useAssPath) {
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

                // تعداد تگ‌های مورد انتظار برای هر شناسه، از روی متن اصلیِ ارسال‌شده به AI
                const originalTagCountById = new Map();
                linesObjArray.forEach(l => originalTagCountById.set(l.id, countTagPlaceholders(l.text)));

                fullMicroDVD = linesObjArray
                    .filter(l => !masterTranslationMap.has(l.id)) 
                    .map(l => l.line).join('\n');

                const pendingLinesCount = fullMicroDVD ? fullMicroDVD.split('\n').filter(l=>l).length : 0;
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

                    const rawAIResponse = await translateChunk(fullMicroDVD, unifiedPrompt, file.name, 10, 80, i, masterTranslationMap, fileId);

                    // پاس نهایی و معتبر: کل پاسخ کامل AI یک‌بار دیگر و به‌طور قطعی
                    // پارس می‌شود تا هیچ خطی به‌خاطر ریزه‌کاری‌های استریم (مثل تکه‌ی
                    // آخر بدون \n) از قلم نیفتد. این تنها منبع حقیقتِ ترجمه‌هاست؛
                    // زمان‌بندی همچنان از آن استفاده نمی‌شود.
                    extractTranslationsFromAIResponse(rawAIResponse, masterTranslationMap);
                    saveProgress(fileId, masterTranslationMap);
                }

                if (!isAlreadyFullyTranslated) {
                    addLog("دریافت ترجمه انجام شد. در حال تطبیق و مرتب‌سازی دقیق خطوط...");
                }
                updateFileStatus(i, "در حال ادغام نتایج...", 80);

                let microDVDSplitted = [];
                let untranslatedLinesData = [];
                let totalUnresolvedErrors = 0;

                linesObjArray.forEach(l => {
                    const id = l.id;
                    const timeKey = l.time;
                    let pushIndex = microDVDSplitted.length; 

                    const health = isTranslationHealthy(id, masterTranslationMap, originalTagCountById);

                    if (health.healthy) {
                        const transText = cleanAIOutput(masterTranslationMap.get(id)).replace(/\n/g, '|');
                        microDVDSplitted.push(`${timeKey}${transText}`);
                    } else {
                        // زمان‌بندی (timeKey) همیشه از خط اصلی گرفته می‌شود، حتی برای خطوط خراب؛
                        // فقط متنِ خراب/جامانده با متن اصلیِ زبان مبدأ جایگزین می‌شود تا خط حذف
                        // یا زمان‌بندی‌اش دستکاری نشود؛ این خط سپس هدفمند دوباره ارسال می‌شود.
                        microDVDSplitted.push(`${timeKey}${l.text.replace(/\n/g, '|')}`);
                        untranslatedLinesData.push({ originalId: id, indexInMerged: pushIndex, originalText: l.text });
                    }
                });

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
                const orderedIds = linesObjArray.map(l => l.id);
                const selfResult = await performSelfCorrection(
                    microDVDSplitted, 
                    i, 
                    model, 
                    apiKey, 
                    prompt,
                    masterTranslationMap, 
                    fileId,
                    isAlreadyFullyTranslated,
                    orderedIds,
                    originalTagCountById
                ); 
                microDVDSplitted = selfResult.lines;
                totalUnresolvedErrors += selfResult.unresolvedCount;

                // --- بررسی نهایی صحت زمان‌بندی (Defensive Check) ---
                // تعداد خطوط و مهر زمانیِ هر خط باید عیناً با فایل ورودی یکی باشد؛
                // این فقط یک تضمین مستندشده نیست، واقعاً همین‌جا هم اعتبارسنجی می‌شود.
                let timingIntegrityOK = (microDVDSplitted.length === linesObjArray.length);
                if (timingIntegrityOK) {
                    for (let ti = 0; ti < linesObjArray.length; ti++) {
                        if (!microDVDSplitted[ti].startsWith(linesObjArray[ti].time)) {
                            timingIntegrityOK = false;
                            break;
                        }
                    }
                }
                if (timingIntegrityOK) {
                    addLog("بررسی نهایی: ترجمه کامل است، خطای نگارشی یافت نشد و زمان‌بندی ۱۰۰٪ با فایل ورودی مطابقت دارد.", false, "green");
                } else {
                    // این حالت نباید هرگز رخ دهد؛ اگر رخ دهد یعنی یک باگ ساختاری وجود دارد
                    // و باید بلافاصله بررسی شود.
                    addLog("خطای داخلی حیاتی: عدم تطابق زمان‌بندی خروجی با ورودی شناسایی شد!", true);
                }

                const finalMicroDVDWithCorrections = microDVDSplitted.join('\n'); 

                let finalContent;
                const outputExt = outputFormatChoice === 'srt' ? '.srt' : '.ass';

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
                    
                    const correctedTexts = originalDialogueBlocks.map((block, indexData) => {
                        const aiLine = microDVDSplitted[indexData]; 
                        let text = block.text; 
                        
                        if (aiLine) {
                            const match = aiLine.match(microDVDLineRegex);
                            if (match) {
                                text = match[3];
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

                // [!!!] FIX: مرتب‌سازی زمانی دیالوگ‌ها برای رفع مشکل به هم ریختگی پلیرها [!!!]
                if (outputFormatChoice === 'ass') {
                    finalContent = sortAssDialogueLines(finalContent);
                }

                                if (outputFormatChoice === 'ass') {
                    addLog(`در حال جاسازی فونت در فایل ${file.name}...`);
                    finalContent = await finalizeAssFile(finalContent);
                    
                    // --- اضافه کردن این بخش برای تغییر قطعی تایتل ---
                    if (/^Title:\s*.*$/im.test(finalContent)) {
                        // اگر تایتل از قبل وجود داشت، آن را جایگزین کن
                        finalContent = finalContent.replace(/^Title:\s*.*$/im, 'Title: Persian (Farsi)');
                    } else if (/\[Script Info\]/i.test(finalContent)) {
                        // اگر تایتل کلاً وجود نداشت، آن را زیر Script Info اضافه کن
                        finalContent = finalContent.replace(/\[Script Info\]/i, '[Script Info]\r\nTitle: Persian (Farsi)');
                    }
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

                if (!userManuallyAborted && (error.name !== 'AbortError' && !error.message.includes("لغو شد"))) {
                    addLog("Translation stopped. Progress saved. Reload the page and upload the file again to resume.", true);
                }

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

                              } else if (errorMessageText.toLowerCase().includes('overloaded') || errorMessageText.toLowerCase().includes('high demand') || errorMessageText.toLowerCase().includes('503')) {
                    userFriendlyMessage = `<p class="font-bold">مدل بیش از حد شلوغ است.</p><p class="mt-2">سرورهای گوگل در حال حاضر ترافیک بسیار بالایی دارند (High Demand). با وجود تلاش‌های مکرر برنامه، سرور پاسخگو نبود. لطفاً چند دقیقه صبر کنید و دوباره امتحان کنید.</p>`;
                    translationStatusMessage.innerHTML = '⚠️ مدل شلوغ است (ترافیک بالا).';
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
        const totalFilesCount = uploadedFiles.length; 
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

    // --- 9. ساخت فایل .ASS و دانلود ---
    function buildASS(originalBlocks, translatedTexts, originalFileName, dialogueData, extraBlocks) {
                const header = `
[Script Info]
Title: Persian (Farsi)
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

            if (isKaraokeActive && dialogueData && dialogueData[i]) {
                if (dialogueData[i].songType === 'OP') {
                    currentStyle = 'OP';
                } else if (dialogueData[i].songType === 'ED') {
                    currentStyle = 'ED';
                } else if (dialogueData[i].isSong) {
                    const blockStartSec = parseTimeToMS(block.start) / 1000;
                    if (blockStartSec < totalDurationSecs * 0.4) currentStyle = 'OP';
                    else currentStyle = 'ED';
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

            if (originalRawText && (originalRawText.includes('{') || originalRawText.includes('}'))) {
                const positionTags = originalRawText.match(/\{\\an\d\}|\{\\pos\([^)]+\)\}/g) || [];
                if (positionTags.length > 0) {
                    assText = positionTags.join('') + assText;
                }
            }

            if (positionOverride) {
                if (!assText.includes('\\an') && !assText.includes('\\pos')) {
                    if (assText.startsWith('{') && assText.includes('}')) assText = `{\\an8${assText.substring(1)}`;
                    else assText = `{\\an8}${assText}`;
                }
            }

            events.push(`Dialogue: ${layer},${block.start},${block.end},${currentStyle},${name},${marginL},${marginR},${marginV},${effect},${assText}`);
        }

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
        
        for (let i = 0; i < originalBlocks.length; i++) {
            const text = translatedTexts[i] || "";
            const cleanText = text.replace(/\r?\n/g, '\r\n');
            allBlocks.push({
                startMs: parseTimeToMS(originalBlocks[i].start),
                endMs: parseTimeToMS(originalBlocks[i].end),
                text: cleanText
            });
        }
        
        if (extraBlocks) {
            for (const b of extraBlocks) {
                allBlocks.push({
                    startMs: parseTimeToMS(b.start),
                    endMs: parseTimeToMS(b.end),
                    text: b.text.replace(/\r?\n/g, '\r\n')
                });
            }
        }
        
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

    // compareTimestamps به subtitle-core.js منتقل شد.

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