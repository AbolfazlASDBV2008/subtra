/**
 * subtitle-core.js
 * هسته‌ی خالص (بدون وابستگی به DOM/localStorage) پردازش زیرنویس:
 * پارس/بازسازی SRT، VTT، ASS، ماسک تگ‌های استایل، توابع زمانی،
 * و صحت‌سنجی خروجی AI. توسط app.js با import مصرف می‌شود.
 */

export let assFormatFields = ['Layer', 'Start', 'End', 'Style', 'Name', 'MarginL', 'MarginR', 'MarginV', 'Effect', 'Text'];
export const drawingCommandRegex = /^\s*m\s+-?\d+/i;

/** حذف BOM از ابتدای متن */
export function stripBOM(text) {
    if (typeof text === 'string' && text.charCodeAt(0) === 0xFEFF) {
        return text.slice(1);
    }
    return text || '';
}

/** جایگزینی تگ‌های {..} با پلیس‌هولدر ___TAG_n___ قبل از ارسال به AI */
export function maskTags(text) {
    const tags = [];
    let maskedText = text.replace(/\{[^}]*?\}/g, (match) => {
        tags.push(match);
        return `___TAG_${tags.length - 1}___`;
    });
    return { maskedText, tags };
}

/** بازگردانی تگ‌های ماسک‌شده به متن؛ تگ جاافتاده به‌جای حذف، به ابتدا اضافه می‌شود */
export function unmaskTags(text, tags) {
    if (!tags || tags.length === 0) {
        // پاکسازی تگ‌های اضافی در صورتی که خط استایل نداشته اما هوش مصنوعی توهم زده باشد
        return text.replace(/[_\[\-]*TAG[_e\-\s]*\d+[_\]\-]*/gi, '');
    }

    let unmaskedText = text;
    let usedTags = new Set();

    tags.forEach((tag, index) => {
        // پشتیبانی از اعداد فارسی و حالت‌های به هم ریخته تگ (مثل _TAG_0 یا [TAG_0])
        const persianIndex = index.toString().replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);
        const regex = new RegExp(`[_\\-\\[]*TAG[_\\-\\s]*(${index}|${persianIndex})[_\\-\\]]*`, 'gi');
        
        if (regex.test(unmaskedText)) {
            unmaskedText = unmaskedText.replace(regex, tag);
            usedTags.add(index);
        }
    });

    // پاکسازی هرگونه تگ مخدوشِ باقی‌مانده که جایگزین نشده است
    unmaskedText = unmaskedText.replace(/[_\\-\\[]*TAG[_\\-\\s]*\d+[_\\-\\]]*/gi, '');

    let unusedTags = tags.filter((_, i) => !usedTags.has(i));
    if (unusedTags.length > 0) {
        let combinedUnused = unusedTags.join('');
        unmaskedText = combinedUnused + unmaskedText;
    }

    unmaskedText = unmaskedText.replace(/\}\{/g, '\\');

    return unmaskedText;
}

/** حذف بلوک‌های کد ```...``` که مدل گاهی دور خروجی می‌گذارد */
export function cleanAIOutput(text) {
    if (!text) return "";
    return text.replace(/^```[a-zA-Z]*\n?/g, '').replace(/\n?```$/g, '').trim();
}

/** شمارش پلیس‌هولدرهای ___TAG_n___ داخل متن */
export function countTagPlaceholders(text) {
    if (!text) return 0;
    const found = text.match(/___TAG_\d+___/g);
    return found ? found.length : 0;
}

/**
 * پارسر واحد پاسخ خام AI؛ فرمت هر خط: [ID:n]{..}{..}متن.
 * محتوای داخل آکولادها همیشه نادیده گرفته می‌شود؛ متن خالی یعنی
 * ترجمه‌نشده و در نتیجه ثبت نمی‌شود.
 */
export function extractTranslationsFromAIResponse(fullText, targetMap = null) {
    const result = new Map();
    if (!fullText) return result;

    const lineRegex = /^\s*\[ID:\s*(\d+)\]\s*(?:\{[^}]*\}\s*){0,2}(.*)$/i;
    const lines = fullText.split('\n');

    for (const rawLine of lines) {
        const match = rawLine.match(lineRegex);
        if (!match) continue;

        const id = parseInt(match[1], 10);
        const text = match[2] != null ? match[2].trim() : '';

        if (!text) continue; // خالی = ترجمه‌نشده

        result.set(id, text);
        if (targetMap) targetMap.set(id, text);
    }

    return result;
}

/** بررسی وجود هیراگانا/کاتاکانا/کانجی در متن */
export function containsJapaneseScript(text) {
    if (!text) return false;
    const cleanText = text.replace(/___TAG_\d+___/g, '').replace(/\{[^}]+\}/g, ' ').trim();
    const hiragana = /[\u3040-\u309F]/;
    const katakana = /[\u30A0-\u30FF]/;
    const kanji = /[\u4E00-\u9FFF]/;
    return hiragana.test(cleanText) || katakana.test(cleanText) || kanji.test(cleanText);
}

/** یک ترجمه سالم است اگر: موجود باشد، متن واقعی داشته باشد، تعداد تگ‌هایش با اصل یکی باشد و حروف ژاپنی در آن نمانده باشد */
export function isTranslationHealthy(id, masterTranslationMap, originalTagCountById) {
    if (!masterTranslationMap.has(id)) return { healthy: false, reason: 'missing' };

    const text = masterTranslationMap.get(id);
    if (typeof text !== 'string' || !text.trim()) return { healthy: false, reason: 'empty' };

    const withoutTags = text.replace(/___TAG_\d+___/g, '').trim();
    if (!withoutTags) return { healthy: false, reason: 'only-tags' };

    // اگر متن نهایی هنوز شامل حروف ژاپنی است، یعنی ترجمه نشده است
    if (containsJapaneseScript(withoutTags)) {
        return { healthy: false, reason: 'leftover-japanese' };
    }

    const expectedTags = originalTagCountById ? (originalTagCountById.get(id) || 0) : 0;
    const actualTags = countTagPlaceholders(text);
    if (expectedTags !== actualTags) return { healthy: false, reason: 'tag-mismatch' };

    return { healthy: true, reason: null };
}

/** Escape کاراکترهای خاص HTML */
export function escapeHTML(str) {
    if (typeof str !== 'string') return str;
    return str.replace(/[&<>"']/g, m => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'}[m]));
}

/** تشخیص متنی که کلاً انگلیسی/ژاپنی مانده (ترجمه نشده) یا نشانه‌ی آهنگ است */
export function isRomajiOrKanji(text) {
    if (!text) return false;
    const cleanText = text.replace(/___TAG_\d+___/g, '').replace(/\{[^}]+\}/g, ' ').trim();
    const allowedCharsRegex = /^[a-zA-Z\s\.,!\?'"\-\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF♪\(\)\*…♡:\/]+$/;

    if (!allowedCharsRegex.test(cleanText)) {
        return false; 
    }

    if (containsJapaneseScript(cleanText)) return true; 

    const songMarkerRegex = /[♪♡]/; 
    if (songMarkerRegex.test(cleanText)) return true;

    return false;
}

/** تبدیل رشته‌ی زمانی (H:MM:SS.ss یا H:MM:SS,ms) به میلی‌ثانیه */
export function parseTimeToMS(timeStr) {
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

/** تبدیل میلی‌ثانیه به فرمت زمانی ASS (H:MM:SS.cc) */
export function msToASS(ms) {
  const totalSec = Math.floor(ms/1000);
  const cs = Math.floor((ms % 1000) / 10); 
  const h = Math.floor(totalSec/3600);
  const m = Math.floor((totalSec%3600)/60);
  const s = totalSec%60;
  return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(cs).padStart(2,'0')}`;
}

/** تبدیل میلی‌ثانیه به فرمت زمانی SRT (HH:MM:SS,mmm) */
export function msToSrtTime(ms) {
    const date = new Date(ms);
    const hours = date.getUTCHours().toString().padStart(2, '0');
    const minutes = date.getUTCMinutes().toString().padStart(2, '0');
    const seconds = date.getUTCSeconds().toString().padStart(2, '0');
    const milliseconds = date.getUTCMilliseconds().toString().padStart(3, '0');
    return `${hours}:${minutes}:${seconds},${milliseconds}`;
}

/** شکستن خط Dialogue بر اساس کاما، بدون شکستن کامای داخل فیلد Text */
export function robustAssSplit(dialogueLine, formatFieldsArray) {
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

/** پارس فایل SRT به آرایه‌ای از بلوک‌های دیالوگ */
export function parseSRT(data) {
    data = stripBOM(data);
    const blocks = [];
    const lines = data.split(/\r?\n/);
    let i = 0;
    let autoIndex = 1;
    while (i < lines.length) {
        const currentTrimmed = lines[i] ? lines[i].trim() : '';
        const isIndexLine = /^\d+$/.test(currentTrimmed);
        const isDirectTimeLine = !isIndexLine && currentTrimmed.includes('-->');

        if (isIndexLine || isDirectTimeLine) {
            let index;
            if (isIndexLine) {
                index = parseInt(currentTrimmed, 10);
                i++;
            } else {
                index = autoIndex;
            }

            if (lines[i] && lines[i].includes('-->')) {
                const [startStr, endStr] = lines[i].split(/\s*-->\s*/);
                const start = msToASS(parseTimeToMS(startStr));
                const end = msToASS(parseTimeToMS(endStr));
                i++;
                let text = [];
                while (lines[i] && lines[i].trim() !== '') {
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
                    autoIndex = index + 1;
                }
            }
        }
        i++;
    }
    return blocks;
}

/** پارس فایل WebVTT به آرایه‌ای از بلوک‌های دیالوگ */
export function parseVTT(data) {
    data = stripBOM(data);
    const blocks = [];
    const lines = data.replace(/WEBVTT[^\n]*\n(\n)*/, '').split(/\r?\n/);
    let i = 0;
    let index = 1;
    while (i < lines.length) {
        if (lines[i] && lines[i].includes('-->')) {
            const timeParts = lines[i].split(/\s*-->\s*/);
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

/** پارس بخش [Events] فایل ASS؛ ترتیب فیلدها از خط Format خود فایل خوانده می‌شود */
export function parseASS(data) {
    data = stripBOM(data);
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
            if (drawingCommandRegex.test(textWithoutTags)) continue; 

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

/** تبدیل مستقیم فایل ASS به متن SRT (بدون مرحله‌ی ترجمه) */
export function cleanAssToSrt(assContent) {
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
            if (drawingCommandRegex.test(textWithoutTags)) continue; 

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

/** آماده‌سازی خطوط ASS برای ارسال به AI (ماسک تگ + فرمت MicroDVD) و ساخت نقشه‌ی بازگشت */
export function processAssForTranslationAndMapping(assContent, fps) {
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
            
            let pureTextForCheck = dialoguePart.replace(/\{[^}]*\}/g, '').trim();

            if (!pureTextForCheck) return;
            if (dialoguePart.trim().endsWith('{\\p0}')) return;
            if (drawingCommandRegex.test(pureTextForCheck)) return; 

            const { maskedText, tags } = maskTags(dialoguePart);

            let textForAI = maskedText.replace(/\\N/g, '|').replace(/\\h/g, ' ').trim();

            if (textForAI.trim()) {
                const startTimeMs = parseTimeToMS(dialogueObj.Start);
                const endTimeMs = parseTimeToMS(dialogueObj.End);
                const startFrame = msToFrames(startTimeMs, fps);
                const endFrame = msToFrames(endTimeMs, fps);
                const microdvdTime = `{${startFrame}}{${endFrame}}`;

                const currentId = mapping.length;

                mapping.push({
                    lineNumber: index,
                    microdvdTime: microdvdTime,
                    text: textForAI,
                    tags: tags 
                });

                microdvdLines.push(`[ID:${currentId}]${microdvdTime}${textForAI}`);
            }
        }
    });

    return {
        map: mapping,
        microdvdForAI: microdvdLines.join('\n')
    };
}

/** بازسازی فایل ASS اصلی با متن ترجمه‌شده؛ زمان‌بندی و بقیه‌ی فیلدها دست‌نخورده می‌مانند */
export function rebuildAssFromTranslation(originalAssContent, mapping, translatedArray) {
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

    const timeGroups = new Map();
    mapping.forEach((mapItem, index) => {
        const timeKey = mapItem.microdvdTime;
        if (!timeGroups.has(timeKey)) timeGroups.set(timeKey, []);
        
        let posX = -1, posY = -1;
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
            lineNumber: mapItem.lineNumber,
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
                    yg.items.sort((a, b) => a.posX - b.posX);
                    
                    const geometries = yg.items.map(item => {
                        let clipValue = null;
                        if (mapping[item.mapIndex].tags) {
                            const allTags = mapping[item.mapIndex].tags.join('');
                            const clipMatch = allTags.match(/\\clip\([^)]+\)/);
                            if (clipMatch) clipValue = clipMatch[0];
                        }
                        return { x: item.posX, clip: clipValue };
                    });

                    geometries.reverse();
                    
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

    mapping.forEach((mapItem, index) => {
        const { lineNumber, tags } = mapItem;

        let translatedText = "";
        const aiLine = translatedArray[index];
        
                if (aiLine) {
            let cleanLine = aiLine.replace(/^\s*\[ID:\s*\d+\]\s*/i, '');
            // پاکسازی تهاجمیِ تمام فریم‌های زمانی (حتی اگر هوش مصنوعی چند بار تکرار کرده باشد)
            cleanLine = cleanLine.replace(/^(?:\{\d+\}\s*)+/g, '');
            // پاکسازی کاراکترهای سرگردان و اضافه‌ای که از فریم‌ها جا مانده‌اند مثل } یا < یا ]
            cleanLine = cleanLine.replace(/^[><\]\}\)]+\s*/g, '');
            translatedText = cleanLine.replace(/\|/g, '\\N');
        }

        if (translatedText) {
            const originalLine = originalLines[lineNumber];
            if (!originalLine || !originalLine.toLowerCase().startsWith('dialogue:')) return;

            const parts = robustAssSplit(originalLine.substring(9).trim(), currentAssFormatFields);
            if (parts.length < currentAssFormatFields.length) return;

            let finalDialogueText = unmaskTags(translatedText, tags);

            let beforeFix;
            do {
                beforeFix = finalDialogueText;
                finalDialogueText = finalDialogueText.replace(/([\u0600-\u06FF\uFB8A\u067E\u0686\u06AF\u200C])(\{[^}]+\})([\u0600-\u06FF\uFB8A\u067E\u0686\u06AF\u200C])/g, '$1$3');
            } while (finalDialogueText !== beforeFix);

            finalDialogueText = finalDialogueText.split('\\N').map(part => {
                const match = part.match(/^((?:\{[^}]+\})*)(.*)$/);
                if (match) {
                    const prefixTags = match[1];
                    let pureText = match[2];

                    if (pureText.trim()) {
                        return `${prefixTags}\u202B${pureText.trim()}\u202C`;
                    } else {
                        return prefixTags;
                    }
                }
                return part.trim() ? `\u202B${part.trim()}\u202C` : part;
            }).join('\\N');

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

/** مرتب‌سازی خطوط Dialogue بر اساس زمان شروع (رفع ناهماهنگی پلیرها) */
export function sortAssDialogueLines(assContent) {
    const lines = assContent.split(/\r?\n/);
    const header = [];
    const dialogues = [];
    let inEvents = false;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        if (trimmed.toLowerCase() === '[events]') {
            inEvents = true;
            header.push(line);
            continue;
        }

        if (!inEvents) {
            header.push(line);
            continue;
        }

        if (trimmed.toLowerCase().startsWith('format:')) {
            header.push(line);
            continue;
        }

        if (trimmed.toLowerCase().startsWith('dialogue:')) {
            let firstComma = line.indexOf(',');
            let secondComma = line.indexOf(',', firstComma + 1);
            
            let startMs = 0;
            if (firstComma !== -1 && secondComma !== -1) {
                let startStr = line.substring(firstComma + 1, secondComma).trim();
                startMs = parseTimeToMS(startStr);
            }
            dialogues.push({ line, startMs });
        } else if (trimmed !== '') {
            header.push(line);
        }
    }

    dialogues.sort((a, b) => a.startMs - b.startMs);

    let sortedEvents = dialogues.map(d => d.line).join('\r\n');
    return header.join('\r\n') + (sortedEvents ? '\r\n' + sortedEvents : '');
}

/** تبدیل زمان به شماره فریم بر اساس fps */
export function timeToFrames(time, fps) {
    const ms = parseTimeToMS(time);
    return Math.floor((ms / 1000) * fps);
}

/** مقایسه‌ی دو timestamp؛ منفی/صفر/مثبت مثل تابع مقایسه‌ی استاندارد */
export function compareTimestamps(t1, t2) {
    const timeToSeconds = (t) => {
        const ms = parseTimeToMS(t);
        return ms / 1000;
    };
    return timeToSeconds(t1) - timeToSeconds(t2);
}