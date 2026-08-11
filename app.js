const fileInput = document.getElementById("fileInput");
const dropzone = document.getElementById("dropzone");
const fileInfo = document.getElementById("fileInfo");
const statusBox = document.getElementById("status");
const summary = document.getElementById("summary");
const inputCount = document.getElementById("inputCount");
const outputCount = document.getElementById("outputCount");
const dateCount = document.getElementById("dateCount");
const previewWrap = document.getElementById("previewWrap");
const previewBody = document.getElementById("previewBody");
const convertBtn = document.getElementById("convertBtn");
const resetBtn = document.getElementById("resetBtn");

let selectedFile = null;
let convertedRows = [];

function setStatus(message, type = "info") {
  statusBox.textContent = message;
  statusBox.className = `status ${type}`;
  statusBox.classList.remove("hidden");
}

function parseCsvLine(line) {
  const result = [];
  let current = "";
  let quoted = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (ch === "," && !quoted) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }

  result.push(current);
  return result;
}

function parseNumber(text) {
  const normalized = String(text)
    .trim()
    .replace(/^"|"$/g, "")
    .replace(/\s/g, "");

  if (!/^-?\d+(?:\.\d+)?$/.test(normalized)) {
    throw new Error(`Некоректне числове значення: "${text}"`);
  }

  const n = Number(normalized);

  if (!Number.isFinite(n)) {
    throw new Error(`Некоректне число: "${text}"`);
  }

  return n;
}

function parseDateTime(text) {
  const s = String(text).trim().replace(/^"|"$/g, "");

  const m = s.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})/);

  if (!m) {
    throw new Error(`Некоректна дата/час: "${text}"`);
  }

  return {
    date: m[1],
    hour: m[2],
    minute: m[3],
    second: m[4],
    raw: s,
  };
}

function formatNumber(n) {
  return Number(n.toFixed(15)).toString();
}

function processCsv(text) {
  text = text.replace(/^\uFEFF/, "");

  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== "");

  if (lines.length < 3) {
    throw new Error("CSV не містить достатньо даних.");
  }

  const header = parseCsvLine(lines[0]).map((v) => v.trim().toLowerCase());

  const dateIndex = header.findIndex((v) =>
    /date|datetime|timestamp|дата/.test(v),
  );

  const valueIndex = header.findIndex((v) =>
    /value|volume|обсяг|значення/.test(v),
  );

  // Для твого формату:
  // A = Date
  // B = Timezone
  // C = Value
  const di = dateIndex >= 0 ? dateIndex : 0;
  const vi = valueIndex >= 0 ? valueIndex : 2;

  const records = [];

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]);

    if (fields.length <= Math.max(di, vi)) {
      throw new Error(`Рядок ${i + 1}: очікуються щонайменше 3 колонки.`);
    }

    const dt = parseDateTime(fields[di]);
    const value = parseNumber(fields[vi]);

    records.push({
      ...dt,
      value,
      line: i + 1,
    });
  }

  if (records.length % 2 !== 0) {
    throw new Error(
      `Знайдено ${records.length} 30-хвилинних записів. ` +
        `Кількість має бути парною.`,
    );
  }

  const result = [];

  for (let i = 0; i < records.length; i += 2) {
    const a = records[i];
    const b = records[i + 1];

    if (a.minute !== "00" || b.minute !== "30") {
      throw new Error(
        `Помилка біля рядків ${a.line}-${b.line}: ` +
          `очікується пара XX:00 → XX:30, ` +
          `отримано ${a.raw} → ${b.raw}.`,
      );
    }

    if (a.date !== b.date || a.hour !== b.hour) {
      throw new Error(
        `Помилка біля рядків ${a.line}-${b.line}: ` +
          `два записи мають бути в одній годині.`,
      );
    }

    // Сума двох 30-хвилинних значень = погодинне значення в кВт
    const kw = a.value + b.value;

    // Переведення кВт → мВт
    const mw = kw / 1000;

    result.push({
      date: a.date,
      time: `${a.hour}:00:00`,
      kw: kw,
      mw: mw,
    });
  }

  return {
    records,
    result,
  };
}

function renderPreview(rows) {
  previewBody.innerHTML = "";

  rows.slice(0, 10).forEach((row) => {
    const tr = document.createElement("tr");

    [row.date, row.time, formatNumber(row.kw), formatNumber(row.mw)].forEach(
      (value) => {
        const td = document.createElement("td");

        td.textContent = value;

        tr.appendChild(td);
      },
    );

    previewBody.appendChild(tr);
  });

  // Оновлюємо заголовок таблиці
  const headers = document.querySelectorAll("#previewWrap th");

  if (headers.length >= 3) {
    headers[0].textContent = "Дата";
    headers[1].textContent = "Час";
    headers[2].textContent = "кВт";

    if (headers.length === 3) {
      const th = document.createElement("th");
      th.textContent = "мВт";

      headers[2].parentNode.appendChild(th);
    }
  }

  previewWrap.classList.remove("hidden");
}

async function handleFile(file) {
  selectedFile = file;
  convertedRows = [];

  convertBtn.disabled = true;
  resetBtn.disabled = false;

  summary.classList.add("hidden");
  previewWrap.classList.add("hidden");

  setStatus("Читаю та перевіряю CSV…", "info");

  fileInfo.textContent = `${file.name} • ${(file.size / 1024).toFixed(1)} KB`;

  fileInfo.classList.remove("hidden");

  try {
    const text = await file.text();

    const { records, result } = processCsv(text);

    convertedRows = result;

    const uniqueDates = new Set(result.map((r) => r.date));

    inputCount.textContent = records.length;
    outputCount.textContent = result.length;
    dateCount.textContent = uniqueDates.size;

    summary.classList.remove("hidden");

    renderPreview(result);

    convertBtn.disabled = false;

    setStatus(
      `Готово: ${records.length} 30-хв. записів → ` +
        `${result.length} погодинних.`,
      "success",
    );
  } catch (error) {
    setStatus(error.message, "error");
  }
}

function downloadXlsx() {
  if (!convertedRows.length || !selectedFile) {
    return;
  }

  // Заголовки Excel
  const data = [["Дата", "Час", "кВт", "мВт"]];

  // Дані
  convertedRows.forEach((row) => {
    data.push([row.date, row.time, row.kw, row.mw]);
  });

  const ws = XLSX.utils.aoa_to_sheet(data);

  // Ширина колонок
  ws["!cols"] = [{ wch: 14 }, { wch: 12 }, { wch: 24 }, { wch: 24 }];

  const wb = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(wb, ws, "Hourly");

  const base = selectedFile.name.replace(/\.csv$/i, "");

  XLSX.writeFile(wb, `${base}_hourly.xlsx`);

  setStatus("Excel-файл успішно сформовано та завантажено.", "success");
}

function reset() {
  selectedFile = null;
  convertedRows = [];

  fileInput.value = "";

  fileInfo.classList.add("hidden");
  statusBox.classList.add("hidden");
  summary.classList.add("hidden");
  previewWrap.classList.add("hidden");

  convertBtn.disabled = true;
  resetBtn.disabled = true;
}

fileInput.addEventListener("change", (e) => {
  const file = e.target.files[0];

  if (file) {
    handleFile(file);
  }
});

["dragenter", "dragover"].forEach((eventName) => {
  dropzone.addEventListener(eventName, (e) => {
    e.preventDefault();

    dropzone.classList.add("drag");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  dropzone.addEventListener(eventName, (e) => {
    e.preventDefault();

    dropzone.classList.remove("drag");
  });
});

dropzone.addEventListener("drop", (e) => {
  const file = e.dataTransfer.files[0];

  if (file) {
    handleFile(file);
  }
});

convertBtn.addEventListener("click", downloadXlsx);

resetBtn.addEventListener("click", reset);
