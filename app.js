(() => {
  'use strict';

  const STORAGE_KEY = 'daynotes.entries.v1';
  const FONT_STORAGE_KEY = 'daynotes.noteFont.v1';
  const LOCALE = 'sv-SE';
  const NOTE_FONTS = [
    'Patrick Hand',
    'Caveat',
    'Kalam',
    'Handlee',
    'Segoe Print',
    'Comic Sans MS',
  ];
  const weekPage = document.querySelector('#week-page');
  const template = document.querySelector('#day-template');
  const weekTitle = document.querySelector('#week-title');
  const saveStatus = document.querySelector('#save-status');
  const settingsButton = document.querySelector('#settings-button');
  const settingsDialog = document.querySelector('#settings-dialog');
  const fontSelect = document.querySelector('#font-select');
  const backupMenu = document.querySelector('.backup-menu');
  const restoreButton = document.querySelector('#restore-button');
  const importInput = document.querySelector('#import-input');
  let currentMonday = mondayFor(new Date());

  function isoDate(date) {
    const local = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    return `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, '0')}-${String(local.getDate()).padStart(2, '0')}`;
  }

  function exportFilename(date) {
    const parts = [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0'),
      String(date.getHours()).padStart(2, '0'),
      String(date.getMinutes()).padStart(2, '0'),
    ];
    return `DayNotes-${parts.join('-')}.json`;
  }

  function mondayFor(date) {
    const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const day = result.getDay();
    result.setDate(result.getDate() - (day === 0 ? 6 : day - 1));
    return result;
  }

  function addDays(date, days) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }

  function readEntries() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  function writeEntries(entries) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  }

  function fontStack(fontName) {
    const selectedIndex = Math.max(NOTE_FONTS.indexOf(fontName), 0);
    const fallbackFonts = NOTE_FONTS.slice(selectedIndex).concat(NOTE_FONTS.slice(0, selectedIndex));
    return fallbackFonts.map((name) => `"${name}"`).concat('cursive').join(', ');
  }

  function readNoteFont() {
    const storedFont = localStorage.getItem(FONT_STORAGE_KEY);
    return NOTE_FONTS.includes(storedFont) ? storedFont : NOTE_FONTS[0];
  }

  function applyNoteFont(fontName) {
    document.documentElement.style.setProperty('--note-font', fontStack(fontName));
    fontSelect.value = fontName;
  }

  function growTextarea(input) {
    input.style.height = 'auto';
    input.style.height = `${input.scrollHeight}px`;
  }

  function ensureWeek() {
    const entries = readEntries();
    let changed = false;
    for (let offset = 0; offset < 7; offset += 1) {
      const key = isoDate(addDays(currentMonday, offset));
      if (!Object.hasOwn(entries, key)) {
        entries[key] = { text: '', updatedAt: null };
        changed = true;
      }
    }
    if (changed) writeEntries(entries);
    return entries;
  }

  function capitalizeFirst(value) {
    return value ? value.charAt(0).toLocaleUpperCase(LOCALE) + value.slice(1) : value;
  }

  function formatDayLabel(date) {
    return capitalizeFirst(date.toLocaleDateString(LOCALE, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }));
  }

  function formatRange(start, end) {
    const week = isoWeekNumber(start);
    const sameYear = start.getFullYear() === end.getFullYear();
    const sameMonth = sameYear && start.getMonth() === end.getMonth();
    let rangeText;

    if (sameMonth) {
      const endText = end.toLocaleDateString(LOCALE, { day: 'numeric', month: 'long', year: 'numeric' });
      rangeText = `${start.getDate()}–${endText}`;
    } else if (sameYear) {
      const startText = start.toLocaleDateString(LOCALE, { day: 'numeric', month: 'long' });
      const endText = end.toLocaleDateString(LOCALE, { day: 'numeric', month: 'long', year: 'numeric' });
      rangeText = `${startText}–${endText}`;
    } else {
      const startText = start.toLocaleDateString(LOCALE, { day: 'numeric', month: 'long', year: 'numeric' });
      const endText = end.toLocaleDateString(LOCALE, { day: 'numeric', month: 'long', year: 'numeric' });
      rangeText = `${startText}–${endText}`;
    }

    return `Vecka ${week} · ${rangeText}`;
  }

  function isoWeekNumber(date) {
    const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const day = target.getUTCDay() || 7;
    target.setUTCDate(target.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
    return Math.ceil((((target - yearStart) / 86400000) + 1) / 7);
  }

  function setStatus(message) {
    saveStatus.textContent = message;
  }

  function normalizeBackupEntries(data) {
    const entries = data && typeof data === 'object' && !Array.isArray(data) && Object.hasOwn(data, 'entries')
      ? data.entries
      : data;

    if (!entries || typeof entries !== 'object' || Array.isArray(entries)) {
      throw new Error('Invalid backup');
    }

    const cleanEntries = {};
    Object.entries(entries).forEach(([key, entry]) => {
      const hasValidDate = /^\d{4}-\d{2}-\d{2}$/.test(key);
      const hasValidEntry = entry
        && typeof entry === 'object'
        && !Array.isArray(entry)
        && typeof entry.text === 'string'
        && (entry.updatedAt === undefined || entry.updatedAt === null || typeof entry.updatedAt === 'string');

      if (!hasValidDate || !hasValidEntry) {
        throw new Error('Invalid backup');
      }

      cleanEntries[key] = { text: entry.text, updatedAt: entry.updatedAt || null };
    });

    return cleanEntries;
  }

  function render() {
    const entries = ensureWeek();
    const todayKey = isoDate(new Date());
    const lastDay = addDays(currentMonday, 6);
    weekTitle.textContent = formatRange(currentMonday, lastDay);
    weekPage.replaceChildren();

    for (let offset = 0; offset < 7; offset += 1) {
      const date = addDays(currentMonday, offset);
      const key = isoDate(date);
      const fragment = template.content.cloneNode(true);
      const section = fragment.querySelector('.day-section');
      const label = fragment.querySelector('.day-label');
      const todayTag = fragment.querySelector('.today-tag');
      const area = fragment.querySelector('.note-area');
      const text = fragment.querySelector('.note-text');
      const input = fragment.querySelector('.note-input');
      const value = entries[key]?.text || '';

      label.dateTime = key;
      label.textContent = formatDayLabel(date);
      text.textContent = value;
      text.classList.toggle('empty', !value);
      input.value = value;
      if (key === todayKey) {
        section.classList.add('today');
        todayTag.hidden = false;
      }

      const startEditing = () => {
        if (section.classList.contains('editing')) return;
        section.classList.add('editing');
        input.value = text.textContent;
        growTextarea(input);
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
      };
      const save = () => {
        if (!section.classList.contains('editing')) return;
        const updatedEntries = readEntries();
        const newValue = input.value;
        updatedEntries[key] = { text: newValue, updatedAt: new Date().toISOString() };
        writeEntries(updatedEntries);
        text.textContent = newValue;
        text.classList.toggle('empty', !newValue);
        section.classList.remove('editing');
        input.style.height = '';
        setStatus(`Sparat ${label.textContent}`);
      };

      area.addEventListener('click', startEditing);
      area.addEventListener('keydown', (event) => {
        if (event.target === input) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          startEditing();
        }
      });
      input.addEventListener('blur', save);
      input.addEventListener('input', () => growTextarea(input));
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          input.value = text.textContent;
          section.classList.remove('editing');
          input.style.height = '';
          input.blur();
        }
      });
      weekPage.append(fragment);
    }
    setStatus('Tryck på en dag för att skriva. Anteckningar sparas på den här enheten.');
  }

  document.querySelector('#previous-button').addEventListener('click', () => {
    currentMonday = addDays(currentMonday, -7);
    render();
  });
  document.querySelector('#next-button').addEventListener('click', () => {
    currentMonday = addDays(currentMonday, 7);
    render();
  });
  document.querySelector('#today-button').addEventListener('click', () => {
    currentMonday = mondayFor(new Date());
    render();
  });
  settingsButton.addEventListener('click', () => {
    settingsDialog.showModal();
  });
  fontSelect.addEventListener('change', () => {
    const fontName = fontSelect.value;
    localStorage.setItem(FONT_STORAGE_KEY, fontName);
    applyNoteFont(fontName);
  });

  document.querySelector('#export-button').addEventListener('click', () => {
    const backup = { app: 'DayNotes', version: 1, exportedAt: new Date().toISOString(), entries: readEntries() };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = exportFilename(new Date());
    link.click();
    URL.revokeObjectURL(link.href);
    setStatus('Säkerhetskopian har laddats ner. Spara den på en trygg plats.');
  });

  restoreButton.addEventListener('click', () => {
    importInput.value = '';
    importInput.click();
  });

  importInput.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const cleanEntries = normalizeBackupEntries(data);
      writeEntries(cleanEntries);
      render();
      setStatus('Säkerhetskopian har återställts.');
      backupMenu.open = false;
    } catch {
      setStatus('Filen kunde inte återställas. Välj en giltig DayNotes-säkerhetskopia i JSON-format.');
    } finally {
      event.target.value = '';
    }
  });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js'));
  }
  applyNoteFont(readNoteFont());
  render();
})();
