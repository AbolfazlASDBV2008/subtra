document.addEventListener('DOMContentLoaded', () => {

    // --- 0. توابع کمکی Storage Manager ---
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

    // --- توابع مدیریت تگ‌های ASS (نسخه جدید: حذف و بازیابی هوشمند) ---

    // استخراج تگ‌های اول خط
    function extractLineStartTags(text) {
        let startTags = '';
        let cleanText = text;
        const startTagRegex = /^(\{[^}]+\})+/;
        const match = cleanText.match(startTagRegex);
        if (match) {
            startTags = match[0];
            cleanText = cleanText.replace(startTagRegex, '').trim();
        }
        return { startTags, cleanText };
    }

    // استخراج تگ‌های درون‌خطی و ذخیره موقعیت نسبی آن‌ها
    function extractInlineTags(text) {
        const tagRegex = /\{[^}]+\}/g;
        let tags = [];
        let cleanText = text;
        let match;

        // محاسبه طول متن بدون تگ برای یافتن موقعیت نسبی
        const totalCleanLength = text.replace(tagRegex, '').length || 1; // جلوگیری از تقسیم بر صفر

        while ((match = tagRegex.exec(text)) !== null) {
            // پیدا کردن طول متن تمیز تا قبل از این تگ
            const textBeforeTag = text.substring(0, match.index);
            const cleanTextBeforeTag = textBeforeTag.replace(tagRegex, '');
            const relativePosition = cleanTextBeforeTag.length / totalCleanLength;

            tags.push({
                tag: match[0],
                position: relativePosition
            });
        }

        cleanText = cleanText.replace(tagRegex, '').trim();
        return { tags, cleanText };
    }

    // قرار دادن مجدد تگ‌های درون‌خطی بر اساس موقعیت نسبی
    function restoreInlineTags(translatedText, tags) {
        if (!tags || tags.length === 0) return translatedText;

        let result = '';
        let currentPos = 0;
        const targetLength = translatedText.length;

        // مرتب‌سازی تگ‌ها بر اساس موقعیت (برای اطمینان)
        tags.sort((a, b) => a.position - b.position);

        for (const tagInfo of tags) {
            const targetIndex = Math.floor(tagInfo.position * targetLength);
            
            // اضافه کردن متن تا قبل از تگ
            result += translatedText.substring(currentPos, targetIndex);
            // اضافه کردن تگ
            result += tagInfo.tag;
            
            currentPos = targetIndex;
        }

        // اضافه کردن بقیه متن
        result += translatedText.substring(currentPos);
        return result;
    }

    // -----------------------------------------------------------

    const apiKeyInput = document.getElementById('apiKey');
    const proxyToggle = document.getElementById('proxyToggle');
    const modelSelect = document.getElementById('modelSelect');
    
    // تنظیمات پیشرفته
    const topPInput = document.getElementById('topP');
    const topPValue = document.getElementById('topPValue');
    const temperatureInput = document.getElementById('temperature');
    const temperatureValue = document.getElementById('temperatureValue');
    const toneSelect = document.getElementById('toneSelect');
    const fpsInput = document.getElementById('fps');
    
    // پرامپت‌ها
    const systemPrompt = document.getElementById('systemPrompt');
    const resetPromptBtn = document.getElementById('resetPrompt');
    
    // آهنگ‌ها
    const aiSongDetectionToggle = document.getElementById('aiSongDetectionToggle');
    const songStyleToggle = document.getElementById('songStyleToggle');
    const romajiPrompt = document.getElementById('romajiPrompt');
    const resetRomajiPromptBtn = document.getElementById('resetRomajiPrompt');
    
    const fileInput = document.getElementById('fileInput');
    const dropZone = document.getElementById('dropZone');
    const fileList = document.getElementById('fileList');
    
    const processFilesBtn = document.getElementById('processFiles');
    const downloadFilesBtn = document.getElementById('downloadFiles');
    
    const overallProgressContainer = document.getElementById('overallProgressSection');
    const overallProgressBar = document.getElementById('overallProgressBar');
    const overallProgressLabel = document.getElementById('overallProgressLabel');
    const liveOutputToggle = document.getElementById('liveOutputToggle');
    
    const statusLog = document.getElementById('statusLog');
    const errorModal = document.getElementById('errorModal');
    const errorMessageContainer = document.getElementById('errorMessage');
    const closeModal = document.getElementById('closeModal');
    const translationStatusMessage = document.getElementById('translationStatusMessage');

    let uploadedFiles = [];
    let processedFiles = [];
    let isProcessing = false;
    let abortController = null;

    // --- 1. مدیریت پرامپت‌ها و تنظیمات ---
    
    // [NEW: Tag Fix] - حذف قوانین مربوط به ___TAG___ چون دیگر از آن‌ها استفاده نمی‌کنیم
    const defaultPromptText = `تو یک مترجم حرفه‌ای زیرنویس انیمه از ژاپنی/انگلیسی به فارسی هستی.
وظیفه تو ترجمه دقیق، روان و محاوره‌ای خطوط زیرنویس است.
فرمت ورودی شامل زمان‌بندی و متن است. (مثلاً {100}{200}Hello)
تو باید دقیقاً همان فرمت زمان‌بندی را در خروجی حفظ کنی و فقط متن را ترجمه کنی.
خروجی تو باید دقیقاً به تعداد خطوط ورودی باشد. هیچ خطی را جا نینداز.

قوانین مهم:
1. لحن ترجمه باید محاوره‌ای و مناسب انیمه باشد (نه کتابی و خشک).
2. اسامی خاص را دقیق و به فارسی روان بنویس.
3. اگر متنی داخل پرانتز یا کروشه است (مثل افکت‌های صوتی)، آن را ترجمه نکن و عیناً کپی کن.
4. فقط و فقط خروجی ترجمه شده را با فرمت خواسته شده بده. هیچ توضیح اضافه‌ای ننویس.`;

    const defaultRomajiPrompt = `تو یک مترجم هنری و ادبی هستی.
متن ورودی شامل اشعار تیتراژ (Opening/Ending) یک انیمه است که ممکن است به زبان ژاپنی (روماجی) یا انگلیسی باشد.
وظیفه تو ترجمه این اشعار به فارسی روان، شاعرانه و زیباست.
مهم:
1. فرمت زمان‌بندی ({start}{end}) را دقیقا حفظ کن.
2. اگر متن ورودی دارای علامت ♪ است، آن را در ترجمه فارسی هم در ابتدا و انتهای خط قرار بده.
3. فقط خروجی نهایی را بده، بدون هیچ توضیح اضافه‌ای.`;

    // تنظیم مقادیر اولیه
    if (!systemPrompt.value) systemPrompt.value = defaultPromptText;
    if (!romajiPrompt.value) romajiPrompt.value = defaultRomajiPrompt;

    resetPromptBtn.addEventListener('click', () => {
        systemPrompt.value = defaultPromptText;
        saveSettings();
        addLog("پرامپت اصلی به حالت پیش‌فرض بازگشت.", false, "yellow");
    });

    resetRomajiPromptBtn.addEventListener('click', () => {
        romajiPrompt.value = defaultRomajiPrompt;
        saveSettings();
        addLog("پرامپت آهنگ به حالت پیش‌فرض بازگشت.", false, "yellow");
    });

    // آپدیت لیبل‌های اسلایدر
    topPInput.addEventListener('input', (e) => { topPValue.textContent = e.target.value; saveSettings();});
    temperatureInput.addEventListener('input', (e) => { temperatureValue.textContent = e.target.value; saveSettings();});

    // ذخیره و بازیابی تنظیمات
    function saveSettings() {
        const settings = {
            apiKey: apiKeyInput.value,
            proxy: proxyToggle.checked,
            model: modelSelect.value,
            topP: topPInput.value,
            temperature: temperatureInput.value,
            tone: toneSelect.value,
            fps: fpsInput.value,
            systemPrompt: systemPrompt.value,
            aiSongDetection: aiSongDetectionToggle.checked,
            songStyle: songStyleToggle.checked,
            romajiPrompt: romajiPrompt.value,
            liveOutput: liveOutputToggle.checked
        };
        localStorage.setItem('animeTranslatorSettings', JSON.stringify(settings));
    }

    function loadSettings() {
        const saved = localStorage.getItem('animeTranslatorSettings');
        if (saved) {
            try {
                const settings = JSON.parse(saved);
                if (settings.apiKey) apiKeyInput.value = settings.apiKey;
                if (settings.proxy !== undefined) proxyToggle.checked = settings.proxy;
                if (settings.model) modelSelect.value = settings.model;
                
                if (settings.topP) { topPInput.value = settings.topP; topPValue.textContent = settings.topP; }
                if (settings.temperature) { temperatureInput.value = settings.temperature; temperatureValue.textContent = settings.temperature; }
                if (settings.tone) toneSelect.value = settings.tone;
                if (settings.fps) fpsInput.value = settings.fps;
                
                if (settings.systemPrompt) systemPrompt.value = settings.systemPrompt;
                
                if (settings.aiSongDetection !== undefined) aiSongDetectionToggle.checked = settings.aiSongDetection;
                if (settings.songStyle !== undefined) songStyleToggle.checked = settings.songStyle;
                if (settings.romajiPrompt) romajiPrompt.value = settings.romajiPrompt;
                if (settings.liveOutput !== undefined) liveOutputToggle.checked = settings.liveOutput;
            } catch (e) {
                console.error("Error loading settings", e);
            }
        }
    }

    [apiKeyInput, proxyToggle, modelSelect, toneSelect, fpsInput, systemPrompt, aiSongDetectionToggle, songStyleToggle, romajiPrompt, liveOutputToggle].forEach(el => {
        el.addEventListener('change', saveSettings);
    });

    // --- 2. مدیریت فایل‌ها ---
    
    function handleFiles(files) {
        for (let file of files) {
            const ext = file.name.split('.').pop().toLowerCase();
            if (['ass', 'srt', 'vtt'].includes(ext)) {
                // جلوگیری از اضافه شدن تکراری
                if (!uploadedFiles.some(f => f.name === file.name && f.size === file.size)) {
                    uploadedFiles.push(file);
                }
            } else {
                showError(`فایل ${file.name} پشتیبانی نمی‌شود. فقط فایل‌های ASS, SRT, VTT مجاز هستند.`);
            }
        }
        updateFileList();
    }
    
    fileInput.addEventListener('change', (e) => {
        handleFiles(e.target.files);
    });
    
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });
    
    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('drag-over');
    });
    
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        handleFiles(e.dataTransfer.files);
    });
    
    function updateFileList() {
        fileList.innerHTML = '';
        if (uploadedFiles.length === 0) {
            fileList.innerHTML = '<p class="text-sm text-gray-400 text-center py-2">هیچ فایلی انتخاب نشده است.</p>';
            processFilesBtn.disabled = true;
            return;
        }
        
        processFilesBtn.disabled = false;
        
        uploadedFiles.forEach((file, index) => {
            const fileItem = document.createElement('div');
            fileItem.className = 'flex justify-between items-center p-3 bg-gray-700 rounded-lg border border-gray-600';
            
            const fileInfo = document.createElement('div');
            fileInfo.className = 'flex flex-col overflow-hidden';
            
            const fileName = document.createElement('span');
            fileName.className = 'text-sm font-medium text-white truncate';
            fileName.textContent = file.name;
            
            const fileMeta = document.createElement('span');
            fileMeta.className = 'text-xs text-gray-400 mt-1';
            fileMeta.textContent = `${(file.size / 1024).toFixed(1)} KB`;
            
            // نمایش وضعیت ذخیره شده
            const fileId = getFileId(file);
            const savedProgress = loadProgress(fileId);
            if (savedProgress && savedProgress.size > 0) {
                const badge = document.createElement('span');
                badge.className = 'ml-2 px-2 py-0.5 text-xs bg-yellow-600 text-white rounded-full';
                badge.textContent = 'ادامه ترجمه';
                fileName.appendChild(badge);
            }
            
            fileInfo.appendChild(fileName);
            fileInfo.appendChild(fileMeta);
            
            const removeBtn = document.createElement('button');
            removeBtn.className = 'p-1.5 text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded-md transition-colors';
            removeBtn.innerHTML = '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>';
            removeBtn.onclick = () => {
                uploadedFiles.splice(index, 1);
                updateFileList();
            };
            
            fileItem.appendChild(fileInfo);
            fileItem.appendChild(removeBtn);
            fileList.appendChild(fileItem);
        });
    }

    // --- 3. پارسرهای فرمت‌های زیرنویس ---

    // تبدیل زمان به فریم (برای MicroDVD)
    function timeToFrames(timeStr, fps = 23.976) {
        const parts = timeStr.split(':');
        let seconds = 0;
        if (parts.length === 3) {
            seconds = parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseFloat(parts[2].replace(',', '.'));
        } else if (parts.length === 2) {
            seconds = parseInt(parts[0]) * 60 + parseFloat(parts[1].replace(',', '.'));
        }
        return Math.floor(seconds * fps);
    }

    // 1. پارسر SRT
    function parseSRT(content) {
        const blocks = content.trim().split(/\r?\n\r?\n/);
        const parsed = [];
        
        for (let block of blocks) {
            const lines = block.split(/\r?\n/);
            if (lines.length >= 3) {
                const index = lines[0];
                const timeStr = lines[1];
                const text = lines.slice(2).join('\n');
                
                const timeMatch = timeStr.match(/(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})/);
                if (timeMatch) {
                    parsed.push({
                        index: index,
                        start: timeMatch[1],
                        end: timeMatch[2],
                        text: text
                    });
                }
            }
        }
        return parsed;
    }

    // 2. پارسر VTT
    function parseVTT(content) {
        let cleanContent = content.replace(/^WEBVTT\r?\n/, '');
        const blocks = cleanContent.trim().split(/\r?\n\r?\n/);
        const parsed = [];
        let index = 1;
        
        for (let block of blocks) {
            const lines = block.split(/\r?\n/);
            let timeLineIdx = 0;
            
            if (!lines[0].includes('-->')) {
                timeLineIdx = 1; 
            }
            
            if (lines.length > timeLineIdx) {
                const timeStr = lines[timeLineIdx];
                const text = lines.slice(timeLineIdx + 1).join('\n').replace(/<[^>]+>/g, ''); // پاک کردن تگ‌های VTT
                
                const timeMatch = timeStr.match(/(\d{2}:\d{2}:\d{2}\.\d{3}|\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}\.\d{3}|\d{2}:\d{2}\.\d{3})/);
                if (timeMatch) {
                    let start = timeMatch[1].replace('.', ',');
                    let end = timeMatch[2].replace('.', ',');
                    if (start.split(':').length === 2) start = '00:' + start;
                    if (end.split(':').length === 2) end = '00:' + end;
                    
                    parsed.push({
                        index: index++,
                        start: start,
                        end: end,
                        text: text
                    });
                }
            }
        }
        return parsed;
    }

    // 3. پارسر ASS (پیشرفته)
    function parseASS(content) {
        const lines = content.split(/\r?\n/);
        const parsed = [];
        let eventsStarted = false;
        let format = [];
        let index = 1;
        
        // نگهداری اطلاعات هدر برای بازسازی
        const headerLines = [];
        
        for (let line of lines) {
            if (line.trim() === '[Events]') {
                eventsStarted = true;
                headerLines.push(line);
                continue;
            }
            
            if (!eventsStarted) {
                headerLines.push(line);
                continue;
            }
            
            if (line.startsWith('Format:')) {
                format = line.replace('Format:', '').trim().split(',').map(s => s.trim());
                headerLines.push(line);
                continue;
            }
            
            if (line.startsWith('Dialogue:')) {
                const values = line.replace('Dialogue:', '').trim().split(',');
                // چون متن خودش ممکنه کاما داشته باشه
                const numFormatItems = format.length;
                const textTokens = values.slice(numFormatItems - 1);
                const text = textTokens.join(',');
                
                const eventObj = {};
                for (let i = 0; i < numFormatItems - 1; i++) {
                    eventObj[format[i]] = values[i];
                }
                eventObj['Text'] = text;
                eventObj['OriginalLine'] = line; // ذخیره خط اصلی
                
                // استانداردسازی زمان (0:00:00.00 -> 00:00:00,000)
                let start = eventObj['Start'];
                let end = eventObj['End'];
                
                const fixTime = (t) => {
                    let [hms, cs] = t.split('.');
                    let [h, m, s] = hms.split(':');
                    h = h.padStart(2, '0');
                    cs = (cs || '00').padEnd(3, '0');
                    return `${h}:${m}:${s},${cs}`;
                };
                
                parsed.push({
                    index: index++,
                    start: fixTime(start),
                    end: fixTime(end),
                    text: text,
                    assData: eventObj // داده‌های اضافی ASS
                });
            } else {
                 if(line.trim() !== '') headerLines.push(line);
            }
        }
        return { parsed, headerLines };
    }

    // --- 4. هوش مصنوعی: تشخیص آهنگ و آماده‌سازی متن ---

    function isRomajiOrKanji(text) {
        // [NEW] حذف موقت علامت‌های نت موسیقی برای جلوگیری از گیج شدن سیستم و امکان ترجمه
        let cleanText = text.replace(/[♪♡]/g, '').trim();
        
        // بررسی حروف ژاپنی
        const japaneseRegex = /[\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf]/;
        if (japaneseRegex.test(cleanText)) return true;
        
        // اگر متن فقط حروف انگلیسی و علائم است اما خیلی شبیه لیریک است (اختیاری - بر اساس کلمات کلیدی)
        // این بخش را فعلا غیرفعال می‌کنیم تا دیالوگ‌های انگلیسی به اشتباه آهنگ تشخیص داده نشوند
        // مگر اینکه توسط تابع AI تشخیص داده شود.
        
        return false;
    }

    // تابع تشخیص آهنگ با استفاده از AI (اسکن ابتدا و انتهای فایل)
    async function detectSongsInSubtitles(blocks, fps, apiKey) {
        if (!aiSongDetectionToggle.checked) return new Set();

        addLog("در حال آنالیز هوشمند برای یافتن آهنگ‌ها (OP/ED)...", false, "yellow");
        
        const songIndices = new Set();
        const firstMinutes = 10 * 60; // 10 دقیقه اول (ثانیه)
        const fileDuration = blocks.length > 0 ? timeToFrames(blocks[blocks.length-1].end, 1) : 0;
        const lastMinutesStart = Math.max(0, fileDuration - (10 * 60)); // 10 دقیقه آخر
        
        const candidateBlocks = [];
        
        for (let block of blocks) {
            const startSec = timeToFrames(block.start, 1);
            // اگر در 10 دقیقه اول یا 10 دقیقه آخر است و طول متن بیشتر از 10 کاراکتر است
            if ((startSec <= firstMinutes || startSec >= lastMinutesStart) && block.text.length > 10) {
                 // فقط خطوطی که شبیه آهنگ هستند (پشت سر هم، کوتاه، دارای وزن) - برای سادگی فعلا همه رو میفرستیم
                 candidateBlocks.push(block);
            }
        }

        if (candidateBlocks.length === 0) return songIndices;

        // نمونه‌گیری: ارسال حداکثر 40 خط اول و 40 خط آخر برای جلوگیری از توکن زیاد
        const samples = [];
        const opCandidates = candidateBlocks.filter(b => timeToFrames(b.start, 1) <= firstMinutes).slice(0, 40);
        const edCandidates = candidateBlocks.filter(b => timeToFrames(b.start, 1) >= lastMinutesStart).slice(-40);
        
        samples.push(...opCandidates);
        samples.push(...edCandidates);

        if (samples.length === 0) return songIndices;

        const textToAnalyze = samples.map(b => `[ID:${b.index}] ${b.text.replace(/\{[^}]+\}/g, '').replace(/<[^>]+>/g, '')}`).join('\n');
        
        const prompt = `تو یک تحلیلگر انیمه هستی. متن زیر خطوطی از زیرنویس یک انیمه است (با آیدی مشخص شده).
وظیفه تو این است که مشخص کنی کدام خطوط مربوط به متن ترانه/آهنگ تیتراژ (Opening یا Ending) هستند.
اشعار معمولا وزن دارند، جملات کوتاه هستند، کلمات کلیدی شاعرانه دارند یا به صورت روماجی (فینگلیش ژاپنی) نوشته شده‌اند. دیالوگ‌های معمولی، داد زدن‌ها، یا نام افراد را انتخاب نکن.
خروجی تو باید فقط و فقط یک آرایه JSON از آیدی خطوطی باشد که آهنگ هستند. بدون هیچ متن اضافه.
مثال خروجی: [5, 6, 7, 8, 90, 91, 92]
اگر هیچ آهنگی پیدا نکردی خروجی بده: []

متن برای تحلیل:
${textToAnalyze}`;

        try {
            const endpoint = proxyToggle.checked 
                ? 'https://gapi.omidz.workers.dev/v1/models/gemini-2.0-flash-exp:generateContent'
                : `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`; // برای آنالیز همیشه از flash استفاده میکنیم چون سریعتره

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(proxyToggle.checked && {'Authorization': `Bearer ${apiKey}`})
                },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: {
                        temperature: 0.1, // دقت بالا
                        response_mime_type: "application/json"
                    }
                })
            });

            if (response.ok) {
                const data = await response.json();
                let resultText = data.candidates[0].content.parts[0].text.trim();
                
                // پاکسازی خروجی
                resultText = resultText.replace(/```json/g, '').replace(/```/g, '').trim();
                const ids = JSON.parse(resultText);
                if (Array.isArray(ids)) {
                    ids.forEach(id => songIndices.add(parseInt(id)));
                    addLog(`تعداد ${ids.length} خط به عنوان آهنگ شناسایی شد.`, false, "green");
                }
            } else {
                 console.error("AI Song Detection Failed:", response.status);
                 addLog("هشدار: تشخیص هوشمند آهنگ با خطا مواجه شد. از روش‌های سنتی استفاده می‌شود.", false, "yellow");
            }
        } catch (error) {
            console.error("Error in AI Song Detection:", error);
            addLog("هشدار: خطای شبکه در تشخیص هوشمند آهنگ.", false, "yellow");
        }

        return songIndices;
    }


    // آماده‌سازی خطوط ASS و استخراج تگ‌ها (نسخه جدید)
    function processAssForTranslationAndMapping(blocks, fps, detectedSongIndices) {
        let microDVDLines = []; // دیالوگ‌های عادی
        let songMicroDVDLines = []; // آهنگ‌ها
        
        let dialogueData = []; // ذخیره اطلاعات برای بازسازی
        
        for (let block of blocks) {
            const startFrame = timeToFrames(block.start, fps);
            const endFrame = timeToFrames(block.end, fps);
            
            let originalText = block.text;
            
            // [NEW] استخراج تگ‌های اول خط به طور کامل
            const { startTags, cleanText: textAfterStartTags } = extractLineStartTags(originalText);
            
            // [NEW] استخراج تگ‌های درون خطی و محاسبه موقعیت
            const { tags: inlineTags, cleanText: textToTranslate } = extractInlineTags(textAfterStartTags);
            
            // اگر متن بعد از حذف تگ‌ها خالی بود، نیازی به ترجمه نیست
            if (textToTranslate.trim() === '') {
                 dialogueData.push({
                    index: block.index,
                    isSong: false,
                    isTranslated: false,
                    startTags: startTags,
                    inlineTags: [],
                    originalText: originalText,
                    finalText: originalText 
                });
                continue;
            }

            // پاکسازی کاراکترهای اضافی مانند \N (نگه داشتن آن‌ها به عنوان اسپیس برای AI)
            let aiText = textToTranslate.replace(/\\N/g, ' ').replace(/\\n/g, ' ').trim();
            
            // تصمیم‌گیری اینکه آیا آهنگ است یا خیر
            let isSong = false;
            if (detectedSongIndices && detectedSongIndices.has(block.index)) {
                isSong = true;
            } else if (isRomajiOrKanji(originalText)) {
                isSong = true;
            }

            // ساخت فرمت MicroDVD
            const lineData = `{${startFrame}}{${endFrame}}${aiText}`;
            
            if (isSong) {
                songMicroDVDLines.push(lineData);
            } else {
                microDVDLines.push(lineData);
            }
            
            dialogueData.push({
                index: block.index,
                isSong: isSong,
                isTranslated: true,
                startTags: startTags, // ذخیره تگ اول خط
                inlineTags: inlineTags, // ذخیره تگ‌های وسط خط با موقعیتشان
                originalText: originalText,
                finalText: "" // بعدا پر می‌شود
            });
        }
        
        return { microDVDLines, songMicroDVDLines, dialogueData };
    }

    // --- 5. ارتباط با API گوگل (Streaming) ---
    
    async function streamGenerateContent(lines, prompt, model, apiKey, onChunk, fileIndex, type = "normal", progressMap, fileId) {
        let fullResponse = "";
        const inputText = lines.join('\n');
        let toneInstruction = toneSelect.value === 'formal' ? "لحن ترجمه رسمی و جدی باشد." : "لحن ترجمه بسیار عامیانه، راحت و صمیمی باشد.";
        
        const finalPrompt = `${prompt}\n\n${toneInstruction}\n\nمتن برای ترجمه:\n${inputText}`;

        const endpoint = proxyToggle.checked 
            ? `https://gapi.omidz.workers.dev/v1/models/${model}:streamGenerateContent`
            : `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${apiKey}`;

        let retries = 3;
        while (retries > 0) {
            try {
                if (abortController && abortController.signal.aborted) {
                    throw new Error("AbortError");
                }

                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(proxyToggle.checked && {'Authorization': `Bearer ${apiKey}`})
                    },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: finalPrompt }] }],
                        generationConfig: {
                            temperature: parseFloat(temperatureInput.value),
                            topP: parseFloat(topPInput.value)
                        },
                        safetySettings: [
                            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
                            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
                            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
                            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
                        ]
                    }),
                    signal: abortController ? abortController.signal : null
                });

                if (!response.ok) {
                    const errData = await response.json().catch(() => ({}));
                    if (response.status === 429 || response.status === 503) {
                         addLog(`سرور شلوغ است (خطای ${response.status}). تلاش مجدد... (${retries} بار باقی مانده)`, true);
                         await new Promise(r => setTimeout(r, 4000));
                         retries--;
                         continue;
                    }
                    throw new Error(`API Error: ${response.status} - ${errData.error?.message || response.statusText}`);
                }

                const reader = response.body.getReader();
                const decoder = new TextDecoder("utf-8");

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    const chunk = decoder.decode(value, { stream: true });
                    const lines = chunk.split('\n');
                    
                    for (const line of lines) {
                        if (line.startsWith('"text":')) {
                            const match = line.match(/"text":\s*"(.*)"/);
                            if (match && match[1]) {
                                let textChunk = match[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
                                fullResponse += textChunk;
                                
                                // ذخیره هر چانک در LocalStorage
                                if (progressMap && fileId) {
                                    const matchLines = fullResponse.split('\n');
                                    matchLines.forEach(ml => {
                                        const frameMatch = ml.match(/^\{(\d+)\}\{(\d+)\}(.*)/);
                                        if (frameMatch) {
                                            progressMap.set(`${frameMatch[1]}-${frameMatch[2]}`, ml);
                                        }
                                    });
                                    // ذخیره سازی هر 10 خط برای بهینه‌سازی
                                    if (progressMap.size % 10 === 0) saveProgress(fileId, progressMap);
                                }

                                if (onChunk) onChunk(fullResponse);
                            }
                        }
                    }
                }
                
                // ذخیره نهایی
                if (progressMap && fileId) saveProgress(fileId, progressMap);
                return fullResponse;

            } catch (error) {
                if (error.message === "AbortError") throw error;
                console.error("Stream error:", error);
                if (retries > 1) {
                    addLog(`خطای ارتباطی. تلاش مجدد... (${retries - 1} بار باقی مانده)`, true);
                    await new Promise(r => setTimeout(r, 3000));
                    retries--;
                } else {
                    throw error;
                }
            }
        }
    }

    // --- 6. مکانیزم‌های بازیابی و اصلاح (Self-Correction) ---

    // تابع کمکی برای ترکیب خطوط ترجمه شده با فریم‌های اصلی
    function mergeTrustedFramesWithAiText(originalLines, aiTranslatedText, progressMap = null) {
        const translatedLines = aiTranslatedText.split(/\n/);
        const translatedTextMap = new Map();
        
        // پر کردن از ذخیره‌ساز (Resume) اگر وجود داشت
        if (progressMap) {
            progressMap.forEach((val, key) => {
                 const match = val.match(/^\{(\d+)\}\{(\d+)\}(.*)/);
                 if (match) translatedTextMap.set(key, match[3]);
            });
        }

        // پر کردن از خروجی جدید
        translatedLines.forEach(line => {
            const match = line.match(/^\{(\d+)\}\{(\d+)\}(.*)/);
            if (match) {
                const key = `${match[1]}-${match[2]}`;
                translatedTextMap.set(key, match[3]);
            }
        });

        const mergedLines = [];
        let missingCount = 0;

        for (const originalLine of originalLines) {
            const match = originalLine.match(/^\{(\d+)\}\{(\d+)\}/);
            if (match) {
                const timeBlockKey = `${match[1]}-${match[2]}`;
                if (translatedTextMap.has(timeBlockKey)) {
                    let transText = translatedTextMap.get(timeBlockKey);
                    mergedLines.push(`{${match[1]}}{${match[2]}}${transText}`);
                } else {
                    // اگر ترجمه پیدا نشد، متن اصلی را نگه دار
                    mergedLines.push(originalLine);
                    missingCount++;
                }
            }
        }

        return { mergedLines, missingCount };
    }

    // تشخیص خطوط جا افتاده و ارسال مجدد
    async function performMissingLineCorrection(originalLines, mergedLines, model, apiKey, promptText, fileIndex) {
        const missingLineIndices = [];
        const linesToResend = [];

        for (let i = 0; i < originalLines.length; i++) {
            if (mergedLines[i] === originalLines[i]) {
                missingLineIndices.push(i);
                linesToResend.push(originalLines[i]);
            }
        }

        if (linesToResend.length === 0) return mergedLines;

        addLog(`یافتن ${linesToResend.length} خط جا افتاده. در حال ترجمه مجدد...`, false, "yellow");
        
        try {
            const resendPrompt = "توجه: خطوط زیر در ترجمه قبلی جا افتاده بودند. لطفا فقط و فقط این خطوط را ترجمه کن و دقیقا فرمت {start}{end} را حفظ کن:\n\n" + promptText;
            const correctionResponse = await streamGenerateContent(linesToResend, resendPrompt, model, apiKey, null, fileIndex, "missing_correction");
            
            const correctedMap = new Map();
            correctionResponse.split(/\n/).forEach(line => {
                const match = line.match(/^\{(\d+)\}\{(\d+)\}(.*)/);
                if (match) correctedMap.set(`${match[1]}-${match[2]}`, line);
            });

            for (let i = 0; i < missingLineIndices.length; i++) {
                const index = missingLineIndices[i];
                const match = originalLines[index].match(/^\{(\d+)\}\{(\d+)\}/);
                if (match) {
                     const key = `${match[1]}-${match[2]}`;
                     if (correctedMap.has(key)) {
                         mergedLines[index] = correctedMap.get(key);
                     }
                }
            }
            addLog("اصلاح خطوط جا افتاده با موفقیت انجام شد.", false, "green");
        } catch (e) {
            console.error("Missing line correction failed:", e);
            addLog("خطا در ترجمه خطوط جا افتاده. از متن اصلی استفاده شد.", true);
        }

        return mergedLines;
    }

    // تشخیص حروف انگلیسی باقی‌مانده و ترجمه مجدد آن‌ها
    async function performSelfCorrection(mergedLines, fileIndex, model, apiKey, basePrompt) {
        const englishLetterRegex = /[a-zA-Z]{3,}/; // کلمات انگلیسی با 3 حرف یا بیشتر
        const linesNeedCorrection = [];
        const indicesToCorrect = [];

        for (let i = 0; i < mergedLines.length; i++) {
            const line = mergedLines[i];
            const match = line.match(/^\{(\d+)\}\{(\d+)\}(.*)/);
            if (match) {
                const text = match[3];
                // اگر متن دارای حروف انگلیسی بود (و تگ ASS نبود)
                if (englishLetterRegex.test(text.replace(/\{[^}]+\}/g, ''))) {
                    linesNeedCorrection.push(line);
                    indicesToCorrect.push(i);
                }
            }
        }

        if (linesNeedCorrection.length === 0) return mergedLines;

        addLog(`یافتن ${linesNeedCorrection.length} خط با حروف انگلیسی (ترجمه ناقص). در حال تلاش برای اصلاح...`, false, "yellow");

        try {
            const fixPrompt = `لطفا خطوط زیر را به فارسی روان ترجمه کن. در ترجمه قبلی، برخی کلمات انگلیسی باقی مانده بودند. 
مهم: فرمت زمان بندی {start}{end} را حفظ کن و فقط ترجمه را بنویس.\n\n${basePrompt}`;
            
            // ارسال دسته‌ای (Chunking) اگر تعداد زیاد بود
            const chunkSize = 20;
            for (let i = 0; i < linesNeedCorrection.length; i += chunkSize) {
                 const chunk = linesNeedCorrection.slice(i, i + chunkSize);
                 const chunkIndices = indicesToCorrect.slice(i, i + chunkSize);
                 
                 const correctionResponse = await streamGenerateContent(chunk, fixPrompt, model, apiKey, null, fileIndex, "self_correction");
                 
                 const correctedMap = new Map();
                 correctionResponse.split(/\n/).forEach(line => {
                     const match = line.match(/^\{(\d+)\}\{(\d+)\}(.*)/);
                     if (match) correctedMap.set(`${match[1]}-${match[2]}`, line);
                 });

                 for (let j = 0; j < chunkIndices.length; j++) {
                     const originalIndex = chunkIndices[j];
                     const oldLine = mergedLines[originalIndex];
                     const match = oldLine.match(/^\{(\d+)\}\{(\d+)\}/);
                     if (match) {
                          const key = `${match[1]}-${match[2]}`;
                          if (correctedMap.has(key)) {
                              mergedLines[originalIndex] = correctedMap.get(key);
                          }
                     }
                 }
            }
            addLog("مرحله اصلاح خودکار به پایان رسید.", false, "green");

        } catch (e) {
            console.error("Self-correction failed:", e);
            addLog("خطا در API هنگام اصلاح. برخی خطوط ممکن است انگلیسی باقی بمانند.", true);
        }

        return mergedLines;
    }


    // --- 7. ساخت فایل نهایی و اعمال استایل‌ها ---

    // تابع جایگزینی \N
    function preserveLineBreaks(translatedText, originalText) {
        // اگر متن اصلی \N دارد اما ترجمه ندارد، سعی کن آن را در وسط جمله قرار دهی
        if (originalText.includes('\\N') && !translatedText.includes('\\N')) {
            const words = translatedText.split(' ');
            if (words.length > 2) {
                const mid = Math.floor(words.length / 2);
                words.splice(mid, 0, '\\N');
                return words.join(' ').replace(' \\N ', '\\N');
            }
        }
        return translatedText;
    }

    // بازسازی فایل ASS (نسخه جدید با تگ‌های هوشمند)
    function rebuildAssFromTranslation(headerLines, dialogueData) {
        let newContent = headerLines.join('\n') + '\n';
        
        for (let data of dialogueData) {
            let finalOutputText = "";
            
            if (!data.isTranslated) {
                finalOutputText = data.finalText; // متنی که نیاز به ترجمه نداشت
            } else {
                let text = data.finalText;
                
                // 1. بازگردانی استایل آهنگ (اختیاری)
                if (data.isSong && songStyleToggle.checked) {
                    // افزودن کد رنگ زرد و چرخش ملایم برای آهنگ‌ها
                    text = `{\\c&H00FFFF&\\t(\\fscx105\\fscy105)}♪ ${text} ♪`;
                }

                // 2. مدیریت \N
                text = preserveLineBreaks(text, data.originalText);

                // 3. بازگردانی تگ‌های درون‌خطی در مکان‌های نسبی
                text = restoreInlineTags(text, data.inlineTags);

                // 4. بازگردانی تگ‌های اول خط
                if (data.startTags) {
                    text = data.startTags + text;
                }
                
                finalOutputText = text;
            }

            // جایگزینی در رویداد ASS
            const originalObj = data.assData;
            let eventLine = "Dialogue: ";
            // فرض بر این است که فرمت استاندارد است: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
            const formatKeys = Object.keys(originalObj).filter(k => k !== 'Text' && k !== 'OriginalLine');
            const values = formatKeys.map(k => originalObj[k]);
            
            // اگر آهنگ بود، استایل را عوض کن (فقط اگر استایل پیش‌فرض بود)
            if (data.isSong && songStyleToggle.checked) {
                const styleIndex = formatKeys.indexOf('Style');
                if (styleIndex !== -1 && values[styleIndex] === 'Default') {
                    values[styleIndex] = 'SongStyle'; 
                }
            }

            eventLine += values.join(',') + ',' + finalOutputText;
            newContent += eventLine + '\n';
        }
        
        return newContent;
    }

    // ساخت فایل ASS ساده از SRT/VTT
    function buildASS(parsedBlocks, translatedTexts, originalFilename, dialogueData) {
        let content = `[Script Info]
Title: ${originalFilename}_Translated
ScriptType: v4.00+
WrapStyle: 0
PlayResX: 1920
PlayResY: 1080
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Vazirmatn Medium,55,&H00FFFFFF,&H0000FFFF,&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1R,2,1,2,30,30,30,1
Style: OP,Vazirmatn Medium,65,&H002EFFFF,&H00FFFFFF,&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1,2.5,1.5,8,30,30,40,1
Style: ED,Vazirmatn Medium,65,&H00FFB4FF,&H00FFFFFF,&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1,2.5,1.5,8,30,30,40,1
Style: SongStyle,Vazirmatn Medium,50,&H0000FFFF,&H000000FF,&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1,2,1,2,30,30,30,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
        
        for (let i = 0; i < parsedBlocks.length; i++) {
            const block = parsedBlocks[i];
            let text = translatedTexts[i] || block.text;
            
            // اصلاح تگ‌های ساده SRT مثل <i> و <b> به ASS
            text = text.replace(/<i>/gi, '{\\i1}').replace(/<\/i>/gi, '{\\i0}')
                       .replace(/<b>/gi, '{\\b1}').replace(/<\/b>/gi, '{\\b0}');
            
            let style = 'Default';
            // چک کردن اینکه آیا این خط آهنگ بوده
            if (dialogueData && dialogueData[i] && dialogueData[i].isSong && songStyleToggle.checked) {
                style = 'SongStyle';
                text = `{\\c&H00FFFF&}♪ ${text} ♪`;
            }

            content += `Dialogue: 0,${block.start},${block.end},${style},,0,0,0,,${text}\n`;
        }
        return content;
    }

    // الصاق فونت (Vazirmatn)
    async function finalizeAssFile(assContent) {
        try {
            addLog("در حال آماده‌سازی و الصاق فونت وزیرمتن...", false, "gray");
            const response = await fetch('vazir.ttf'); // فرض بر این است که فونت در کنار اسکریپت است
            if (response.ok) {
                const blob = await response.blob();
                const reader = new FileReader();
                return new Promise((resolve) => {
                    reader.onloadend = () => {
                        const base64data = reader.result.split(',')[1];
                        const lines = base64data.match(/.{1,80}/g);
                        
                        let fontSection = `\n[Fonts]\nfontname: vazir.ttf\n`;
                        fontSection += lines.join('\n') + '\n';
                        
                        resolve(assContent + fontSection);
                    };
                    reader.readAsDataURL(blob);
                });
            } else {
                 addLog("هشدار: فونت وزیرمتن (vazir.ttf) پیدا نشد. فایل بدون فونت داخلی ذخیره می‌شود.", false, "yellow");
                 return assContent;
            }
        } catch (e) {
            console.error("Font fetch error:", e);
            addLog("هشدار: خطا در الصاق فونت. فایل بدون فونت داخلی ذخیره می‌شود.", false, "yellow");
            return assContent;
        }
    }


    // --- 8. جریان اصلی برنامه (Main Pipeline) ---
    
    processFilesBtn.addEventListener('click', async () => {
        const apiKey = apiKeyInput.value.trim();
        if (!apiKey) {
            showError("لطفاً کلید API (Gemini API Key) را وارد کنید.");
            return;
        }
        if (uploadedFiles.length === 0) return;

        isProcessing = true;
        abortController = new AbortController();
        processedFiles = [];
        
        processFilesBtn.disabled = true;
        processFilesBtn.innerHTML = '<span class="animate-pulse">در حال ترجمه...</span>';
        downloadFilesBtn.disabled = true;
        translationStatusMessage.classList.add('hidden');
        statusLog.innerHTML = '';
        
        overallProgressContainer.style.display = 'block';
        overallProgressBar.style.width = '0%';
        overallProgressLabel.textContent = `پیشرفت کلی: 0 / ${uploadedFiles.length} فایل`;

        const model = modelSelect.value;
        const mainPrompt = systemPrompt.value;
        const songPrompt = romajiPrompt.value;
        const fps = parseFloat(fpsInput.value) || 23.976;

        let totalFiles = uploadedFiles.length;

        try {
            for (let i = 0; i < totalFiles; i++) {
                const file = uploadedFiles[i];
                const fileId = getFileId(file);
                addLog(`شروع پردازش فایل: ${file.name}`, false, "blue");
                
                // لود کردن پروگرس قبلی (Resume)
                let progressMap = loadProgress(fileId);
                if (progressMap.size > 0) {
                     addLog(`یافتن اطلاعات ذخیره شده. ادامه ترجمه از خط ${progressMap.size}...`, false, "yellow");
                }

                const content = await file.text();
                const isAss = file.name.endsWith('.ass');
                
                let parsedBlocks = [];
                let assHeaderLines = [];
                
                if (isAss) {
                    const assData = parseASS(content);
                    parsedBlocks = assData.parsed;
                    assHeaderLines = assData.headerLines;
                } else if (file.name.endsWith('.srt')) {
                    parsedBlocks = parseSRT(content);
                } else if (file.name.endsWith('.vtt')) {
                    parsedBlocks = parseVTT(content);
                }

                if (parsedBlocks.length === 0) {
                    addLog(`فایل ${file.name} خالی یا نامعتبر است.`, true);
                    continue;
                }

                // 1. تشخیص آهنگ
                const songIndices = await detectSongsInSubtitles(parsedBlocks, fps, apiKey);

                // 2. آماده‌سازی و استخراج تگ‌ها
                const { microDVDLines, songMicroDVDLines, dialogueData } = processAssForTranslationAndMapping(parsedBlocks, fps, songIndices);

                addLog(`آماده‌سازی خطوط: ${microDVDLines.length} دیالوگ، ${songMicroDVDLines.length} خط آهنگ.`, false, "gray");

                // --- 3. ترجمه آهنگ‌ها (اگر وجود داشتند) ---
                let finalSongLines = [];
                let songProgressMap = new Map(); // برای آهنگ ها رزومه مجزا در نظر نمیگیریم تا پیچیده نشود
                if (songMicroDVDLines.length > 0) {
                    addLog("ارسال خطوط آهنگ به هوش مصنوعی...", false, "gray");
                    
                    const onSongChunk = liveOutputToggle.checked ? (text) => {
                         const match = text.match(/\{(\d+)\}\{(\d+)\}(.*)/g);
                         if(match && match.length > 0) {
                              const lastLine = match[match.length - 1].replace(/^\{(\d+)\}\{(\d+)\}/, '');
                              addLog(`[Live Song] ${lastLine.substring(0, 30)}...`);
                         }
                    } : null;

                    try {
                        const songResponse = await streamGenerateContent(songMicroDVDLines, songPrompt, model, apiKey, onSongChunk, i, "song", songProgressMap, fileId + "_song");
                        const mergedSongResult = mergeTrustedFramesWithAiText(songMicroDVDLines, songResponse, songProgressMap);
                        finalSongLines = mergedSongResult.mergedLines;
                        
                        if (mergedSongResult.missingCount > 0) {
                             addLog(`هشدار: ${mergedSongResult.missingCount} خط آهنگ ترجمه نشد. تلاش برای اصلاح...`, false, "yellow");
                             finalSongLines = await performMissingLineCorrection(songMicroDVDLines, finalSongLines, model, apiKey, songPrompt, i);
                        }
                    } catch (e) {
                         addLog("خطا در ترجمه آهنگ. از متن اصلی استفاده خواهد شد.", true);
                         finalSongLines = songMicroDVDLines; // Fallback
                    }
                }

                // --- 4. ترجمه دیالوگ‌های اصلی ---
                let finalMainLines = [];
                if (microDVDLines.length > 0) {
                    addLog("ارسال دیالوگ‌های اصلی به هوش مصنوعی...", false, "gray");
                    
                    // محاسبه خطوطی که باید فرستاده شوند (فیلتر کردن آنهایی که قبلا در Resume ذخیره شده اند)
                    const linesToSend = [];
                    microDVDLines.forEach(line => {
                         const match = line.match(/^\{(\d+)\}\{(\d+)\}/);
                         if (match) {
                             const key = `${match[1]}-${match[2]}`;
                             if (!progressMap.has(key)) {
                                 linesToSend.push(line);
                             }
                         }
                    });

                    let mainResponse = "";
                    if (linesToSend.length > 0) {
                        const onMainChunk = liveOutputToggle.checked ? (text) => {
                             const match = text.match(/\{(\d+)\}\{(\d+)\}(.*)/g);
                             if(match && match.length > 0) {
                                  const lastLine = match[match.length - 1].replace(/^\{(\d+)\}\{(\d+)\}/, '');
                                  addLog(`[Live] ${lastLine.substring(0, 40)}...`);
                             }
                        } : null;

                        try {
                             // تقسیم بندی (Chunking) برای فایل های خیلی بزرگ
                             const CHUNK_SIZE = 400; // حدود 400 خط در هر ریکوئست
                             for(let c = 0; c < linesToSend.length; c += CHUNK_SIZE) {
                                  const chunk = linesToSend.slice(c, c + CHUNK_SIZE);
                                  addLog(`ترجمه بخش ${Math.floor(c/CHUNK_SIZE)+1} از ${Math.ceil(linesToSend.length/CHUNK_SIZE)}...`);
                                  const chunkResponse = await streamGenerateContent(chunk, mainPrompt, model, apiKey, onMainChunk, i, "normal", progressMap, fileId);
                                  mainResponse += chunkResponse + "\n";
                             }
                        } catch (e) {
                             addLog("خطا در ترجمه دیالوگ‌ها متوقف شد. وضعیت ذخیره شد. می‌توانید دوباره تلاش کنید.", true);
                             throw e; // پرتاب خطا برای توقف حلقه کلی
                        }
                    } else {
                         addLog("تمام خطوط قبلاً ترجمه و ذخیره شده بودند.", false, "green");
                    }

                    // ترکیب خطوط
                    const mergedMainResult = mergeTrustedFramesWithAiText(microDVDLines, mainResponse, progressMap);
                    finalMainLines = mergedMainResult.mergedLines;

                    // 5. اصلاح خطوط جا افتاده
                    if (mergedMainResult.missingCount > 0) {
                        finalMainLines = await performMissingLineCorrection(microDVDLines, finalMainLines, model, apiKey, mainPrompt, i);
                    }
                    
                    // 6. اصلاح خودکار (تگ‌های خراب یا انگلیسی مانده)
                    finalMainLines = await performSelfCorrection(finalMainLines, i, model, apiKey, mainPrompt);
                }

                // --- 7. مپ کردن نتایج به دیالوگ دیتا ---
                const songMap = new Map();
                finalSongLines.forEach(l => { const m = l.match(/^\{(\d+)\}\{(\d+)\}(.*)/); if(m) songMap.set(`${m[1]}-${m[2]}`, m[3]);});
                
                const mainMap = new Map();
                finalMainLines.forEach(l => { const m = l.match(/^\{(\d+)\}\{(\d+)\}(.*)/); if(m) mainMap.set(`${m[1]}-${m[2]}`, m[3]);});

                const finalPlainTexts = []; // برای فایل‌های SRT/VTT

                for (let j = 0; j < parsedBlocks.length; j++) {
                    const block = parsedBlocks[j];
                    const startFrame = timeToFrames(block.start, fps);
                    const endFrame = timeToFrames(block.end, fps);
                    const key = `${startFrame}-${endFrame}`;
                    
                    let transText = "";
                    if (dialogueData[j].isSong && songMap.has(key)) transText = songMap.get(key);
                    else if (mainMap.has(key)) transText = mainMap.get(key);
                    else transText = dialogueData[j].originalText; // Fallback
                    
                    dialogueData[j].finalText = transText;
                    finalPlainTexts.push(transText);
                }

                // --- 8. تولید فایل نهایی ---
                let finalContent = "";
                let outputFilename = file.name.replace(/\.(srt|vtt|ass)$/i, '_FA.ass');

                if (isAss) {
                    finalContent = rebuildAssFromTranslation(assHeaderLines, dialogueData);
                } else {
                    finalContent = buildASS(parsedBlocks, finalPlainTexts, file.name, dialogueData);
                }

                // الصاق فونت
                finalContent = await finalizeAssFile(finalContent);

                processedFiles.push({
                    name: outputFilename,
                    content: finalContent
                });

                // پاک کردن رزومه بعد از موفقیت کامل
                clearProgress(fileId);

                overallProgressBar.style.width = `${((i + 1) / totalFiles) * 100}%`;
                overallProgressLabel.textContent = `پیشرفت کلی: ${i + 1} / ${totalFiles} فایل`;
                addLog(`فایل ${file.name} با موفقیت ترجمه شد.`, false, "green");
            }
            
            translationStatusMessage.innerHTML = "✔️ عملیات با موفقیت به پایان رسید!";
            translationStatusMessage.className = "status-message status-complete";
            translationStatusMessage.classList.remove('hidden');
            downloadFilesBtn.disabled = false;

        } catch (error) {
            if (error.message !== "AbortError") {
                console.error(error);
                showError(`خطای سیستمی: ${error.message}`);
                translationStatusMessage.innerHTML = "❌ عملیات با خطا متوقف شد. لاگ‌ها را بررسی کنید.";
                translationStatusMessage.className = "status-message status-error";
                translationStatusMessage.classList.remove('hidden');
            } else {
                addLog("عملیات توسط کاربر لغو شد.", false, "yellow");
            }
        } finally {
            isProcessing = false;
            processFilesBtn.disabled = false;
            processFilesBtn.innerHTML = 'شروع ترجمه و تبدیل به ASS';
        }
    });

    // --- 9. دانلود فایل‌ها ---
    
    downloadFilesBtn.addEventListener('click', () => {
        if (processedFiles.length === 0) return;
        
        if (processedFiles.length === 1) {
            downloadFile(processedFiles[0].name, processedFiles[0].content);
        } else {
            // [توجه: برای دانلود زیپ در حالت کلاینت ساید نیاز به کتابخانه JSZip است. 
            // در اینجا برای سادگی فایل‌ها یکی یکی دانلود می‌شوند]
            processedFiles.forEach((f, index) => {
                setTimeout(() => { downloadFile(f.name, f.content); }, index * 500);
            });
            addLog("دانلود فایل‌ها آغاز شد.", false, "blue");
        }
    });
    
    function downloadFile(filename, content) {
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }
    
    // --- 10. توابع کمکی UI (لاگ و خطا) ---
    
    function escapeHTML(str) {
        return str.replace(/[&<>'"]/g, 
            tag => ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                "'": '&#39;',
                '"': '&quot;'
            }[tag])
        );
    }

    function addLog(message, isError = false, color = "gray") {
        const logEntry = document.createElement('p');
        if (isError) logEntry.className = 'text-red-400 font-bold';
        else if (color === 'green') logEntry.className = 'text-green-400';
        else if (color === 'yellow') logEntry.className = 'text-yellow-400';
        else if (color === 'blue') logEntry.className = 'text-blue-400';
        else logEntry.className = 'text-gray-300';
        logEntry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`; // از escapeHTML صرف نظر شد تا استایل‌ها اعمال شوند
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

    // --- 11. لاجیک حالت ترکیبی (Manual Import & Repair) ---
    const manualInput = document.getElementById('manualTranslationInput');
    const processManualBtn = document.getElementById('processManualTranslation');

    if(processManualBtn) { // اطمینان از وجود دکمه در DOM
        processManualBtn.addEventListener('click', async () => {
            if (uploadedFiles.length === 0) {
                showError("لطفاً ابتدا فایل اصلی (انگلیسی) را در بخش انتخاب فایل آپلود کنید.");
                return;
            }
            
            const rawTranslatedText = manualInput.value.trim();
            if (!rawTranslatedText) {
                showError("لطفاً متن ترجمه شده را در کادر وارد کنید.");
                return;
            }

            const apiKey = apiKeyInput.value.trim();
            if (!apiKey) {
                showError("برای اصلاح خطاهای احتمالی، به کلید API نیاز است.");
                return;
            }

            // قفل کردن UI
            processManualBtn.disabled = true;
            processManualBtn.textContent = "⏳ در حال آنالیز و اصلاح...";
            addLog("--- شروع پردازش دستی ---");

            try {
                // فرض می‌کنیم اولین فایل لیست، فایل اصلی است
                const originalFile = uploadedFiles[0];
                const originalContent = await originalFile.text();
                let fps = parseFloat(fpsInput.value) || 23.976;

                // 1. پارس کردن فایل اصلی
                let originalBlocks = [];
                let headerLines = [];
                const isAss = originalFile.name.endsWith('.ass');

                if (isAss) {
                    const assData = parseASS(originalContent);
                    originalBlocks = assData.parsed;
                    headerLines = assData.headerLines;
                } else if (originalFile.name.endsWith('.srt')) {
                    originalBlocks = parseSRT(originalContent);
                } else if (originalFile.name.endsWith('.vtt')) {
                    originalBlocks = parseVTT(originalContent);
                }

                if (originalBlocks.length === 0) throw new Error("فایل اصلی خالی یا نامعتبر است.");

                // 2. استخراج تگ‌ها از فایل اصلی
                const { dialogueData } = processAssForTranslationAndMapping(originalBlocks, fps, new Set());

                // 3. پارس کردن متن پیست شده
                let translatedBlocks = [];
                if (rawTranslatedText.includes('-->')) {
                    translatedBlocks = parseSRT(rawTranslatedText); // SRT پارسر برای متون کپی شده از وب هم خوب کار می‌کند
                } else {
                    const lines = rawTranslatedText.split(/\n/).filter(l => l.trim().length > 0);
                    translatedBlocks = lines.map((text, i) => ({ index: i+1, text: text }));
                }

                addLog(`فایل اصلی: ${originalBlocks.length} خط | ترجمه وارد شده: ${translatedBlocks.length} خط`);

                // 4. ادغام 
                let mergedMicroDVDLines = [];
                
                for (let i = 0; i < originalBlocks.length; i++) {
                    const orig = originalBlocks[i];
                    const transBlock = translatedBlocks[i]; 
                    const transText = transBlock ? transBlock.text : "";

                    const startFrame = timeToFrames(orig.start, fps);
                    const endFrame = timeToFrames(orig.end, fps);
                    
                    let finalText = transText.trim() ? transText : orig.text;
                    // تمیزکاری متن از تگ‌های اضافی
                    finalText = finalText.replace(/<[^>]+>/g, '').trim();

                    mergedMicroDVDLines.push(`{${startFrame}}{${endFrame}}${finalText}`);
                }

                // 5. ارسال برای اصلاح خطا (با استفاده از flash)
                addLog("در حال بررسی خطاهای ترجمه (انگلیسی ماندن خطوط)...");
                const correctionModel = 'gemini-2.0-flash-exp'; 
                const correctedLines = await performSelfCorrection(
                    mergedMicroDVDLines, 
                    0, 
                    correctionModel, 
                    apiKey,
                    systemPrompt.value
                );

                // 6. قرار دادن تگ‌ها و تبدیل به فرمت نهایی
                const finalTexts = correctedLines.map(line => {
                    const match = line.match(/\{(\d+)\}\{(\d+)\}(.*)/);
                    return match ? match[3] : "";
                });

                // آپدیت dialogueData با متون نهایی
                for (let i = 0; i < dialogueData.length; i++) {
                     dialogueData[i].finalText = finalTexts[i] || "";
                }

                let finalContent = "";
                if(isAss) {
                    finalContent = rebuildAssFromTranslation(headerLines, dialogueData);
                } else {
                    finalContent = buildASS(originalBlocks, finalTexts, originalFile.name, dialogueData); 
                }
                
                finalContent = await finalizeAssFile(finalContent);

                processedFiles.push({
                    name: originalFile.name.replace(/\.(srt|vtt|ass)$/i, '_Manual_FA.ass'),
                    content: finalContent
                });

                addLog("پردازش دستی تمام شد. فایل آماده دانلود است.", false, "green");
                downloadFilesBtn.disabled = false;
                translationStatusMessage.innerHTML = "✔️ تبدیل دستی با موفقیت انجام شد.";
                translationStatusMessage.className = "status-message status-complete";
                translationStatusMessage.classList.remove('hidden');

            } catch (e) {
                showError(e.message);
                addLog(`خطا در پردازش دستی: ${e.message}`, true);
            } finally {
                processManualBtn.disabled = false;
                processManualBtn.textContent = "🛠️ پردازش، اصلاح خطاها و ساخت زیرنویس";
            }
        });
    }

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