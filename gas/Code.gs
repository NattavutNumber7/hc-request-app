// =====================================
// CONFIG
// =====================================
// Firebase project ID — ใช้สำหรับ Firestore REST API
var FIREBASE_PROJECT_ID = 'hc-request-app'

// Columns ใน sheet "Job Openings YYYY" (1-based index)
// ถ้า header เปลี่ยน ให้แก้ค่าตรงนี้
var COL_OPEN_JOBS  = 1   // A: Open Jobs
var COL_EMP_TYPE   = 2   // B: Emp. Type
var COL_JOB_TYPE   = 3   // C: Job Type
var COL_HCID       = 4   // D: HCID
var COL_POSITION   = 5   // E: Position
var COL_RANK       = 6   // F: Rank
var COL_DEPT       = 7   // G: Department
var COL_BU         = 8   // H: Business Unit
var COL_PIC        = 9   // I: PIC
var COL_STATUS     = 10  // J: Status
var COL_CANDIDATE  = 11  // K: Offered Candidate
var COL_OFFER_DATE = 12  // L: Offering Date
var COL_START_DATE = 16  // P: Onboard Date

// =====================================
// REVERSE SYNC: Sheets → Firestore
// =====================================
/**
 * onEdit trigger — ตรวจจับการแก้ไขใน sheet "Job Openings YYYY"
 *
 * เมื่อ TA แก้ค่า Status (col J) หรือ PIC (col I) ใน Sheets
 * script จะอ่าน HCID (col D) แล้วอัพเดต Firestore ผ่าน REST API
 *
 * วิธี setup trigger:
 *   GAS Editor → Extensions → Apps Script Triggers
 *   → + Add Trigger → Function: onSheetEdit, Event: onEdit
 *
 * หมายเหตุ: ต้องใช้ Installable Trigger (ไม่ใช่ Simple Trigger)
 * เพราะต้องการสิทธิ์ UrlFetchApp สำหรับเรียก Firestore REST API
 */
function onSheetEdit(e) {
  try {
    var sheet = e.source.getActiveSheet()
    // ทำงานเฉพาะ sheet ชื่อ "Job Openings YYYY"
    if (!sheet.getName().startsWith('Job Openings')) return

    var col = e.range.getColumn()
    var row = e.range.getRow()
    if (row <= 1) return // ข้าม header row

    // ตรวจเฉพาะ column PIC (I) และ Status (J)
    if (col !== COL_PIC && col !== COL_STATUS) return

    var hcId = sheet.getRange(row, COL_HCID).getValue()
    if (!hcId) return

    // อ่านค่าทั้งหมดที่ sync ได้
    var status        = sheet.getRange(row, COL_STATUS).getValue()
    var pic           = sheet.getRange(row, COL_PIC).getValue()
    var candidateName = sheet.getRange(row, COL_CANDIDATE).getValue()
    var startDate     = sheet.getRange(row, COL_START_DATE).getValue()

    // แปลง startDate เป็น string ถ้าเป็น Date object
    if (startDate instanceof Date && !isNaN(startDate)) {
      var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
      startDate = startDate.getDate() + '-' + months[startDate.getMonth()] + '-' + startDate.getFullYear()
    }

    // อัพเดต Firestore
    var result = updateFirestoreByHcId_(hcId, {
      status:           status           || null,
      assignedToName:   pic              || null,
      candidateName:    candidateName    || null,
      startDate:        startDate        || null,
    })

    Logger.log('[onSheetEdit] hcId=' + hcId + ' → ' + JSON.stringify(result))
  } catch (err) {
    Logger.log('[onSheetEdit] ERROR: ' + err.message)
  }
}

/**
 * อัพเดต Firestore document ที่มี hcId ตรงกัน
 * ใช้ Firestore REST API + ScriptApp.getOAuthToken() สำหรับ authentication
 *
 * ขั้นตอน:
 *   1. Query Firestore: hc_requests WHERE hcId == hcId (limit 1)
 *   2. ได้ document name (resource path) มา
 *   3. PATCH document ด้วย fields ที่ต้องการอัพเดต
 *
 * @param {string} hcId  - HCID เช่น 'REQ-2026-411'
 * @param {object} data  - { status, assignedToName, candidateName, startDate }
 * @returns {object}     - { success, docId } หรือ { success: false, error }
 */
function updateFirestoreByHcId_(hcId, data) {
  var baseUrl = 'https://firestore.googleapis.com/v1/projects/' + FIREBASE_PROJECT_ID + '/databases/(default)/documents'
  var token   = ScriptApp.getOAuthToken()
  var headers = { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }

  // ── Step 1: Query ──────────────────────────────────────────────────────────
  var queryPayload = {
    structuredQuery: {
      from: [{ collectionId: 'hc_requests' }],
      where: {
        fieldFilter: {
          field: { fieldPath: 'hcId' },
          op: 'EQUAL',
          value: { stringValue: hcId.toString().trim() }
        }
      },
      limit: 1
    }
  }

  var queryResp = UrlFetchApp.fetch(baseUrl + ':runQuery', {
    method: 'post',
    headers: headers,
    payload: JSON.stringify(queryPayload),
    muteHttpExceptions: true
  })

  var queryData = JSON.parse(queryResp.getContentText())
  if (!queryData[0] || !queryData[0].document) {
    return { success: false, error: 'Document not found for hcId: ' + hcId }
  }

  var docName = queryData[0].document.name  // full resource path
  var docId   = docName.split('/').pop()

  // ── Step 2: สร้าง fields object สำหรับ PATCH ─────────────────────────────
  // เฉพาะ field ที่มีค่า (ไม่ส่ง null ไปเพื่อป้องกัน overwrite ข้อมูลที่มีอยู่)
  var fields = {}
  var updateMask = []

  var VALID_STATUSES = ['Open','Recruiting','Interviewing','Offering','Onboarding','Rejected','Closed','Cancelled']

  if (data.status && VALID_STATUSES.includes(data.status)) {
    fields['status'] = { stringValue: data.status }
    updateMask.push('status')
  }
  if (data.assignedToName) {
    fields['assignedToName'] = { stringValue: data.assignedToName }
    updateMask.push('assignedToName')
  }
  if (data.candidateName) {
    fields['candidateName'] = { stringValue: data.candidateName }
    updateMask.push('candidateName')
  }
  if (data.startDate) {
    fields['startDate'] = { stringValue: data.startDate }
    updateMask.push('startDate')
  }

  if (updateMask.length === 0) return { success: true, docId, note: 'nothing to update' }

  // ── Step 3: PATCH document ─────────────────────────────────────────────────
  // updateMask ระบุเฉพาะ field ที่ต้องการอัพเดต (ไม่ลบ field อื่น)
  var patchUrl = baseUrl + '/hc_requests/' + docId + '?'
    + updateMask.map(function(f) { return 'updateMask.fieldPaths=' + f }).join('&')

  var patchResp = UrlFetchApp.fetch(patchUrl, {
    method: 'patch',
    headers: headers,
    payload: JSON.stringify({ fields: fields }),
    muteHttpExceptions: true
  })

  var patchStatus = patchResp.getResponseCode()
  if (patchStatus !== 200) {
    return { success: false, error: 'PATCH failed: ' + patchResp.getContentText() }
  }

  return { success: true, docId: docId }
}

// =====================================
// SLACK NOTIFICATIONS
// =====================================
// อ่าน Slack webhook URL จาก Script Properties (GAS Editor → Project Settings → Script Properties)
// key: SLACK_NEW_REQUEST, SLACK_UPDATES
var _props            = PropertiesService.getScriptProperties()
var SLACK_NEW_REQUEST = _props.getProperty('SLACK_NEW_REQUEST') || ''
var SLACK_UPDATES     = _props.getProperty('SLACK_UPDATES')     || ''

function slackNewRequest(data) {
  var emoji = data.requestType === 'New HC' ? '🆕' : '🔁'
  var type  = data.requestType === 'New HC'
    ? 'New HC × ' + data.headcount
    : 'Replacement (ทดแทน ' + (data.replacementFor || '-') + ')'
  var text = emoji + ' *HC Request ใหม่* <!subteam^S0313EL64GG|@taro>\n' +
    '*ตำแหน่ง:* ' + data.position + '  |  *JG:* ' + data.jg + '\n' +
    '*แผนก:* ' + data.department + '  |  *Location:* ' + data.orgTrack + '\n' +
    '*ประเภท:* ' + type + '\n' +
    '*ผู้ยื่น:* ' + data.requesterName + '\n' +
    '🔗 https://hcrequest.web.app/all-requests'
  sendSlack_(SLACK_NEW_REQUEST, text)
}

function slackStatusUpdate(position, department, oldStatus, newStatus, assignedTo, candidateName) {
  var icons = { Recruiting:'🔍', Interviewing:'🗣️', Offering:'📋', Onboarding:'🟦', Rejected:'❌', Closed:'✅', Cancelled:'🚫', Open:'📂' }
  var emoji = icons[newStatus] || '🔄'
  var taLine = assignedTo ? '\n*คนรับเคส:* ' + assignedTo : ''
  var candidateLine = (newStatus === 'Onboarding' && candidateName) ? '\n*Candidate:* ' + candidateName : ''
  var text = emoji + ' *Status อัพเดต*\n' +
    '*ตำแหน่ง:* ' + position + ' (' + department + ')\n' +
    '*สถานะ:* ' + oldStatus + ' → *' + newStatus + '*' + taLine + candidateLine
  sendSlack_(SLACK_UPDATES, text)
}

function sendSlack_(webhookUrl, text) {
  try {
    UrlFetchApp.fetch(webhookUrl, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ text: text }),
      muteHttpExceptions: true
    })
  } catch (err) {
    Logger.log('Slack error: ' + err.message)
  }
}

// =====================================
// DO GET
// =====================================
function doGet(e) {
  const ss = SpreadsheetApp.openById('17dUCqyAMSwPl4Se0z7AczreiI9GWrTGDihs5Wf5u9sc')

  if (e.parameter.action === 'maintenance') {
    var isDown = e.parameter.active === 'true'
    var msg = isDown
      ? '🔴 *ระบบ HC Request ปิดปรับปรุงชั่วคราว* <!subteam^S0313EL64GG|@taro>\nไม่สามารถเข้าใช้งานได้ขณะนี้ กรุณารอสักครู่'
      : '🟢 *ระบบ HC Request เปิดใช้งานแล้ว* <!subteam^S0313EL64GG|@taro>\nสามารถเข้าใช้งานได้ที่ https://hcrequest.web.app'
    sendSlack_(SLACK_NEW_REQUEST, msg)
    sendSlack_(SLACK_UPDATES, msg)
    return responseJson_({ success: true })
  }

  if (e.parameter.action === 'updateStatus') {
    try {
      const docId          = e.parameter.id
      const newStatus      = e.parameter.status
      const assignedToName = e.parameter.assignedToName || null
      const startDate      = e.parameter.startDate      || null
      const candidateName  = e.parameter.candidateName  || null

      const VALID = ['Open','Recruiting','Interviewing','Offering','Onboarding','Rejected','Closed','Cancelled']
      if (!docId || !newStatus)       return responseJson_({ success: false, error: 'Missing params' })
      if (!VALID.includes(newStatus)) return responseJson_({ success: false, error: 'Invalid status: ' + newStatus })

      const sheet = ss.getSheetByName('HC_Request')
      if (!sheet) return responseJson_({ success: false, error: 'Sheet HC_Request not found' })

      const headers          = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
      const idColIdx         = headers.indexOf('Request ID')
      const statusColIdx     = headers.indexOf('Status')
      const taColIdx         = headers.indexOf('คนรับเคส')
      const startDateColIdx  = headers.indexOf('วันที่เริ่มงาน')
      const candidateColIdx  = headers.indexOf('ชื่อ Candidate')
      const posColIdx        = headers.indexOf('ตำแหน่ง')
      const deptColIdx       = headers.indexOf('แผนก')

      if (idColIdx === -1) return responseJson_({ success: false, error: 'ไม่พบ column Request ID ใน header' })

      for (let i = 2; i <= sheet.getLastRow(); i++) {
        if (sheet.getRange(i, idColIdx + 1).getValue() === docId) {
          var oldStatus = statusColIdx !== -1 ? sheet.getRange(i, statusColIdx + 1).getValue() : ''
          var position  = posColIdx    !== -1 ? sheet.getRange(i, posColIdx    + 1).getValue() : ''
          var dept      = deptColIdx   !== -1 ? sheet.getRange(i, deptColIdx   + 1).getValue() : ''

          if (statusColIdx    !== -1) sheet.getRange(i, statusColIdx    + 1).setValue(newStatus)
          if (assignedToName  && taColIdx        !== -1) sheet.getRange(i, taColIdx        + 1).setValue(assignedToName)
          if (startDate       && startDateColIdx !== -1) sheet.getRange(i, startDateColIdx + 1).setValue(startDate)
          if (candidateName   && candidateColIdx !== -1) sheet.getRange(i, candidateColIdx + 1).setValue(candidateName)

          slackStatusUpdate(position, dept, oldStatus, newStatus, assignedToName, candidateName)
          return responseJson_({ success: true })
        }
      }
      return responseJson_({ success: false, error: 'Row not found: ' + docId })
    } catch (err) {
      return responseJson_({ success: false, error: err.message })
    }
  }

  const mgSheet = ss.getSheetByName('Manager_Access')
  const mgData  = mgSheet.getDataRange().getValues()
  const managers = {}
  for (let i = 1; i < mgData.length; i++) {
    if (mgData[i][0]) managers[mgData[i][0].trim()] = mgData[i][1].trim()
  }

  const mainSheet = ss.getSheetByName('MainData')
  const mainData  = mainSheet.getDataRange().getValues()
  const employees = {}, positionsByDept = {}
  for (let i = 1; i < mainData.length; i++) {
    const name = mainData[i][1]?.toString().trim()
    const dept = mainData[i][3]?.toString().trim()
    const pos  = mainData[i][4]?.toString().trim()
    if (name && dept) {
      if (!employees[dept]) employees[dept] = []
      employees[dept].push(name)
    }
    if (pos && dept) {
      if (!positionsByDept[dept]) positionsByDept[dept] = new Set()
      positionsByDept[dept].add(pos)
    }
  }
  const positions = {}
  for (const [dept, set] of Object.entries(positionsByDept)) {
    positions[dept] = [...set].sort()
  }
  return ContentService
    .createTextOutput(JSON.stringify({ managers, positions, employees }))
    .setMimeType(ContentService.MimeType.JSON)
}

// =====================================
// DO POST
// =====================================
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents)
    var ss   = SpreadsheetApp.openById('17dUCqyAMSwPl4Se0z7AczreiI9GWrTGDihs5Wf5u9sc')

    // ─── NEW: syncBatch ─────────────────────────────────────
    // รับ array ของ rows และ upsert ลงใน sheet "Job Openings YYYY"
    if (data.action === 'syncBatch') {
      return syncBatchHandler_(ss, data.rows || [])
    }

    // ─── Existing: new HC request ────────────────────────────
    var sheet = ss.getSheetByName('HC_Request') || ss.insertSheet('HC_Request')

    if (sheet.getLastRow() === 0) {
      sheet.appendRow([
        'Status','ประเภทคำขอ','Job Grade','ตำแหน่ง','แผนก','Google Drive Link',
        'ชื่อผู้ยื่น','คนรับเคส','จำนวน HC','เหตุผล','Requirements',
        'วันที่เริ่มงาน','วันที่ลาออก (LWD)','ทดแทน (ชื่อ)','Email ผู้ยื่น','Timestamp','Request ID',
        'ชื่อ Candidate',
      ])
      sheet.getRange(1, 1, 1, 18).setFontWeight('bold').setBackground('#4a90d9').setFontColor('#ffffff')
      sheet.setFrozenRows(1)
    }

    var isNew = data.requestType === 'New HC'
    sheet.appendRow([
      data.status, data.requestType, data.jg, data.position, data.department,
      data.driveLink || '', data.requesterName, '',
      data.headcount, data.reason, data.requirements || '',
      isNew ? data.targetStartDate : '', isNew ? '' : data.targetStartDate,
      data.replacementFor || '', data.requesterEmail,
      new Date(data.createdAt), data.id,
      '',
    ])

    if (!data.maintenance) slackNewRequest(data)
    return responseJson_({ success: true })
  } catch (err) {
    return responseJson_({ success: false, error: err.message })
  }
}

// =====================================
// SYNC BATCH HANDLER
// upsert rows ลง sheet "Job Openings YYYY" โดยใช้ HCID เป็น key
// =====================================
function syncBatchHandler_(ss, rows) {
  if (!rows || rows.length === 0) return responseJson_({ success: true, synced: 0 })

  var year      = new Date().getFullYear()
  var sheetName = 'Job Openings ' + year
  var sheet     = ss.getSheetByName(sheetName)

  // สร้าง sheet ใหม่ถ้ายังไม่มี
  if (!sheet) {
    sheet = ss.insertSheet(sheetName)
    var headers = [
      'Open Jobs','Emp. Type','Job Type','HCID','Position','Rank',
      'Department','Business Unit','PIC','Status','Offered Candidate',
      'Offering Date','Offer Month','Offer Year','SLA Offer (Days)',
      'Onboard Date','Contract End Date'
    ]
    sheet.appendRow(headers)
    sheet.getRange(1, 1, 1, headers.length)
      .setFontWeight('bold')
      .setBackground('#008065')
      .setFontColor('#ffffff')
    sheet.setFrozenRows(1)
  }

  // สร้าง map: HCID → row number (สำหรับ upsert)
  var lastRow   = sheet.getLastRow()
  var lastCol   = sheet.getLastColumn()
  var hcidColNo = 4   // column D = HCID (1-indexed)
  var rowMap    = {}  // { hcId: rowNumber }

  if (lastRow > 1) {
    var hcidValues = sheet.getRange(2, hcidColNo, lastRow - 1, 1).getValues()
    hcidValues.forEach(function(cell, i) {
      if (cell[0]) rowMap[cell[0].toString().trim()] = i + 2  // +2 = skip header + 0-index
    })
  }

  var synced = 0
  rows.forEach(function(r) {
    if (!r.hcId) return

    // แปลง openDate เป็น readable format
    var openDate = ''
    if (r.openDate) {
      try {
        var d = new Date(r.openDate)
        var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
        openDate = d.getDate() + '-' + months[d.getMonth()] + '-' + d.getFullYear()
      } catch(_) {}
    }

    var onboardDate = r.startDate || ''

    // แปลง offeringDate เป็น formatted date + month + year
    var offeringDateFmt = '', offerMonth = '', offerYear = ''
    if (r.offeringDate) {
      try {
        var od = new Date(r.offeringDate)
        var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
        offeringDateFmt = od.getDate() + '-' + months[od.getMonth()] + '-' + od.getFullYear()
        offerMonth = String(od.getMonth() + 1).padStart(2, '0')
        offerYear  = String(od.getFullYear())
      } catch(_) {}
    }

    var rowData = [
      openDate,                        // Open Jobs
      r.employmentType || 'Monthly',   // Emp. Type
      r.requestType || '',             // Job Type
      r.hcId,                          // HCID
      r.position || '',                // Position
      r.jg || '',                      // Rank
      r.department || '',              // Department
      r.businessUnit || '',            // Business Unit
      r.assignedToName || '',          // PIC
      r.status || '',                  // Status
      r.candidateName || '',           // Offered Candidate
      offeringDateFmt,                 // Offering Date
      offerMonth,                      // Offer Month
      offerYear,                       // Offer Year
      '',                              // SLA Offer (Days) — computed by app
      onboardDate,                     // Onboard Date
      r.contractEndDate || '',         // Contract End Date
    ]

    var existingRow = rowMap[r.hcId.toString().trim()]
    if (existingRow) {
      // Update existing row — อัพเดตเฉพาะ columns ที่เปลี่ยนได้
      sheet.getRange(existingRow, 1, 1, rowData.length).setValues([rowData])
    } else {
      // Append new row
      sheet.appendRow(rowData)
      // อัพเดต rowMap สำหรับ rows ถัดไปใน batch เดียวกัน
      rowMap[r.hcId] = sheet.getLastRow()
    }
    synced++
  })

  return responseJson_({ success: true, synced: synced, sheet: sheetName })
}

// ── Helper ──────────────────────────────────────────────────────
function responseJson_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON)
}
