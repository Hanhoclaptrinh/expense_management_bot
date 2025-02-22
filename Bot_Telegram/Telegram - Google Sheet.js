const TOKEN = `YOUR_API_TOKEN`;
const BASE_URL = `https://api.telegram.org/bot${TOKEN}`;
const CHAT_ID = "YOUR_CHAT_ID";
const DEPLOYED_URL =
  "YOUR_DEPLOY_URL";
const METHODS = {
  SEND_MESSAGE: "sendMessage",
  SET_WEBHOOK: "setWebhook",
  GET_UPDATES: "getUpdates",
  DELETE_WEBHOOK: "deleteWebhook",
};

// Utils
const toQueryParamsString = (obj) => {
  return Object.keys(obj)
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(obj[key])}`)
    .join("&");
};

// =====================
//     TELEGRAM APIs
// =====================
const makeRequest = async (method, queryParams = {}) => {
  const url = `${BASE_URL}/${method}?${toQueryParamsString(queryParams)}`;
  const response = await UrlFetchApp.fetch(url);
  return response.getContentText();
};

const sendMessage = (text) => {
  makeRequest(METHODS.SEND_MESSAGE, {
    chat_id: CHAT_ID,
    text,
  });
};

// =====================
//     SHEET
// =====================
const addNewRow = (content = []) => {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const lastRow = sheet.getLastRow();
  const columnNumber = content.length;
  const newRow = sheet.getRange(lastRow + 1, 1, 1, columnNumber);
  newRow.setValues([content]);
};

// =====================
//     CALCULATE TOTAL
// =====================
const calculateTotal = (type, month, year) => {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const values = sheet.getDataRange().getValues().slice(1);

  return values.reduce((sum, row, index) => {
    try {
      let rowDate = row[0];
      if (!(rowDate instanceof Date)) {
        // Chuyển đổi định dạng DD/MM/YYYY sang MM/DD/YYYY
        const dateParts = String(rowDate).split(/[\/\s,]+/);
        if (dateParts.length >= 3) {
          const [day, monthStr, yearStr] = dateParts;
          rowDate = new Date(`${monthStr}/${day}/${yearStr}`);
        }
      }

      if (isNaN(rowDate.getTime())) return sum;

      const rowMonth = rowDate.getMonth() + 1;
      const rowYear = rowDate.getFullYear();

      if (rowMonth === parseInt(month) && rowYear === parseInt(year)) {
        const columnIndex = type === "Income" ? 3 : 2;
        const cellValue = String(row[columnIndex] || "0");
        const cleanedValue = cellValue
          .replace(/[^\d,.-]/g, "")
          .replace("₫", "");
        const amount = Number(cleanedValue.replace(/,/g, ""));

        return sum + (isNaN(amount) ? 0 : amount);
      }
    } catch (e) {
      console.error(`Error processing row ${index + 2}:`, e);
    }
    return sum;
  }, 0);
};

// =====================
//     PROCESSING INPUT
// =====================
const processMessage = (text) => {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const time = new Date().toLocaleString();

  if (/^Report tháng (\d+) năm (\d+)$/i.test(text)) {
    const [_, month, year] = text.match(/^Report tháng (\d+) năm (\d+)$/i);

    // Validate month và year
    const monthNum = parseInt(month);
    const yearNum = parseInt(year);

    if (monthNum < 1 || monthNum > 12) {
      sendMessage(⚠️ Tháng không hợp lệ! Vui lòng nhập tháng từ 1 - 12.");
      return;
    }

    if (yearNum < 1930 || yearNum > 2201) {
      sendMessage("⚠️ Năm không hợp lệ!");
      return;
    }

    const totalIncome = calculateTotal("Income", month, year);
    const totalExpense = calculateTotal("Expense", month, year);
    const balance = totalIncome - totalExpense;

    // Format số tiền với dấu phẩy ngăn cách hàng nghìn
    const formatNumber = (num) =>
      num.toLocaleString("vi-VN", { style: "currency", currency: "VND" });

    sendMessage(
      `📊 Report tháng ${month}/${year}\n` +
        `💰 Thu nhập: ${formatNumber(totalIncome)}\n` +
        `💸 Chi tiêu: ${formatNumber(totalExpense)}\n` +
        `💵 Còn lại: ${formatNumber(balance)}`
    );
  } else if (/^(.*) \+(\d+)(.*)$/g.test(text)) {
    const [_, label, amountText, unit] = text.match(/^(.*) \+(\d+)(.*)$/);
    const amount = Number(amountText) * getMultiplyBase(unit);
    addNewRow([time, label.trim(), "", amount]);
    sendMessage(`✅ Done! ${label.trim()} ${amountText}${unit}`);
  } else if (/^(.*) (\d+)(.*)$/g.test(text)) {
    const [_, label, amountText, unit] = text.match(/^(.*) (\d+)(.*)$/);
    const amount = Number(amountText) * getMultiplyBase(unit);
    addNewRow([time, label.trim(), amount, ""]);
    sendMessage(`✅ Done! ${label.trim()} ${amountText}${unit}`);
  } else {
    sendMessage("⚠️ Lệnh không hợp lệ! Vui lòng nhập đúng định dạng.");
  }
};

// =====================
//  CURRENCY PROCESSING
// =====================
const getMultiplyBase = (unitLabel) => {
  switch (unitLabel.toLowerCase()) {
    case "k":
    case "nghìn":
    case "ng":
    case "ngàn":
      return 1000;
    case "xị":
    case "lít":
    case "trăm":
      return 100000;
    case "củ":
    case "tr":
    case "m":
    case "triệu":
      return 1000000;
    default:
      return 1;
  }
};

// =====================
//      WEBHOOKS
// =====================
const doPost = (request) => {
  const contents = JSON.parse(request.postData.contents);
  const text = contents.message.text;
  processMessage(text);
};

// =====================
//     SET WEBHOOK
// =====================
const setWebhook = () => {
  const url = `${BASE_URL}/${METHODS.SET_WEBHOOK}?url=${encodeURIComponent(
    DEPLOYED_URL
  )}`;
  const response = UrlFetchApp.fetch(url);
  Logger.log(response.getContentText());
};

// =====================
//     DELETE WEBHOOK
// =====================
const deleteWebhook = () => {
  const url = `${BASE_URL}/${METHODS.DELETE_WEBHOOK}`;
  const response = UrlFetchApp.fetch(url);
  Logger.log(response.getContentText());
};

// =====================
//     CHECK DATA
// =====================
const checkSheetData = () => {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const values = sheet.getDataRange().getValues();

  console.log("Sheet headers:", values[0]);
  console.log("Total rows (including header):", values.length);

  // Log một vài dòng đầu tiên để kiểm tra format
  values.slice(1, 5).forEach((row, index) => {
    console.log(`Row ${index + 1}:`, {
      date: row[0],
      description: row[1],
      expense: row[2],
      income: row[3],
    });
  });
};
