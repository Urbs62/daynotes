(() => {
  'use strict';

  const STORAGE_KEY = 'daynotes.entries.v1';
  const weekPage = document.querySelector('#week-page');
  const template = document.querySelector('#day-template');
  const weekTitle = document.querySelector('#week-title');
  const saveStatus = document.querySelector('#save-status');
  let currentMonday = mondayFor(new Date());

  function isoDate(date) {
    const local = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    return `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, '0')}-${String(local.getDate()).padStart(2, '0')}`;
  }

  function parseIsoDate(value) {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day);
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

  function formatRange(start, end) {
    const week = isoWeekNumber(start);
    const startText = start.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
    const endText = end.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
    return `Week ${week} · ${startText} – ${endText}`;
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
      label.textContent = date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' });
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
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
      };
      const save = () => {
        if (!section.classList.contains('editing')) return;
        const updatedEntries = readEntries();
        const newValue = input.value.trimEnd();
        updatedEntries[key] = { text: newValue, updatedAt: new Date().toISOString() };
        writeEntries(updatedEntries);
        text.textContent = newValue;
        text.classList.toggle('empty', !newValue);
        section.classList.remove('editing');
        setStatus(`Saved ${label.textContent}`);
      };

      area.addEventListener('click', startEditing);
      area.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          startEditing();
        }
      });
      input.addEventListener('blur', save);
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          input.value = text.textContent;
          section.classList.remove('editing');
          input.blur();
        }
      });
      weekPage.append(fragment);
    }
    setStatus('Tap a day to write. Notes are saved on this device.');
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

  document.querySelector('#export-button').addEventListener('click', () => {
    const backup = { app: 'DayNotes', version: 1, exportedAt: new Date().toISOString(), entries: readEntries() };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `daynotes-backup-${isoDate(new Date())}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
    setStatus('Backup downloaded. Keep it somewhere safe.');
  });

  document.querySelector('#import-input').addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const entries = data.entries || data;
      if (!entries || typeof entries !== 'object' || Array.isArray(entries)) throw new Error('Invalid backup');
      const cleanEntries = {};
      Object.entries(entries).forEach(([key, entry]) => {
        if (/^\d{4}-\d{2}-\d{2}$/.test(key) && entry && typeof entry.text === 'string') {
          cleanEntries[key] = { text: entry.text, updatedAt: entry.updatedAt || null };
        }
      });
      if (!window.confirm(`Restore ${Object.keys(cleanEntries).length} notes? This replaces the notes currently on this device.`)) return;
      writeEntries(cleanEntries);
      render();
      setStatus('Backup restored to this device.');
    } catch {
      setStatus('That file is not a valid DayNotes backup.');
    } finally {
      event.target.value = '';
    }
  });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js'));
  }
  render();
})();
