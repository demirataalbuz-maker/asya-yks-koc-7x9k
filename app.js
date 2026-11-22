let TOPICS_CATALOG = {};
let PENDING_IMAGE_DATA = null;
let PENDING_IMAGE_NAME = null;

let ACTIVE_MISSION = null;
let OPTICAL_ANSWERS = {};

let ACTIVE_MOCK_EXAM = null;
let MOCK_ANSWERS = {};
let MOCK_TIMER_INTERVAL = null;
let MOCK_ELAPSED_SECONDS = 0;

document.addEventListener("DOMContentLoaded", async () => {
  setupNavigation();
  setupDropzoneAndPaste();
  if (window.ASYA_STATIC_MODE && typeof window.asyaWaitForUnlock === "function") {
    await window.asyaWaitForUnlock();
  }
  await loadTopics();
  await refreshAll();
});

function setupNavigation() {
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });
}

function switchTab(tabName) {
  document.querySelectorAll(".nav-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.tab === tabName);
  });
  document.querySelectorAll(".tab-panel").forEach((p) => {
    p.classList.toggle("active", p.id === `tab-${tabName}`);
  });

  if (tabName === "dashboard") loadDashboard();
  if (tabName === "daily") loadDailyHub();
  if (tabName === "scores") loadScores();
  if (tabName === "reminders") loadReminders();
  if (tabName === "mock") loadMockExams();
  if (tabName === "bank") loadQuestions();
}

async function refreshAll() {
  await Promise.all([
    loadDashboard(),
    loadDailyHub(),
    loadScores(),
    loadReminders(),
    loadQuestions(),
    loadMockExams(),
  ]);
}

function uploadUrl(filename) {
  if (window.ASYA_STATIC_MODE && window.ASYA_STATIC_DATA?.images?.[filename]) {
    return window.ASYA_STATIC_DATA.images[filename];
  }
  const enc = encodeURIComponent(filename || "");
  return window.ASYA_STATIC_MODE ? `uploads/${enc}` : `/uploads/${enc}`;
}

function reminderPdfAttr(mode, batchNo) {
  if (window.ASYA_STATIC_MODE) {
    const bArg = batchNo ? Number(batchNo) : "null";
    return `href="#" onclick="event.preventDefault(); window.openStaticReminderPrint('${mode}', ${bArg});"`;
  }
  if (batchNo) return `href="/api/reminders/pdf?batch_no=${batchNo}" target="_blank"`;
  if (mode === "final") return `href="/api/reminders/pdf?mode=final&only_unmastered=true" target="_blank"`;
  return `href="/api/reminders/pdf?mode=archive" target="_blank"`;
}

function missionPdfAttr(m) {
  if (window.ASYA_STATIC_MODE) {
    return `href="#" onclick="event.preventDefault(); window.openStaticMissionPrint(${m.id});"`;
  }
  return `href="${m.pdf_url}" target="_blank"`;
}

function missionPrintAttr(m) {
  if (window.ASYA_STATIC_MODE) {
    return `href="#" onclick="event.preventDefault(); window.openStaticMissionPrint(${m.id});"`;
  }
  return `href="${m.print_url}" target="_blank"`;
}

async function apiFetch(url, options = {}) {
  if (window.ASYA_STATIC_MODE && typeof window.staticApiFetch === "function") {
    return window.staticApiFetch(url, options);
  }
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.detail || "Bir hata oluştu.");
  }
  return data;
}

function showToast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.remove("hidden");
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => el.classList.add("hidden"), 3500);
}

function renderMath(el) {
  if (window.renderMathInElement && el) {
    window.renderMathInElement(el, {
      delimiters: [
        { left: "$$", right: "$$", display: true },
        { left: "$", right: "$", display: false },
      ],
      throwOnError: false,
    });
  }
}

function openLightbox(src) {
  document.getElementById("lightbox-img").src = src;
  document.getElementById("lightbox").classList.remove("hidden");
}

function closeLightbox() {
  document.getElementById("lightbox").classList.add("hidden");
}

/* ---------- Konu Kataloğu ---------- */

async function loadTopics() {
  const data = await apiFetch("/api/topics");
  TOPICS_CATALOG = data.topics || {};
  updateSubjectOptions();
  populateFilterSubjects();
}

function updateSubjectOptions() {
  const examType = document.getElementById("q-exam-type").value;
  const subjSelect = document.getElementById("q-subject");
  const subjects = Object.keys(TOPICS_CATALOG[examType] || {});
  subjSelect.innerHTML = subjects
    .map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`)
    .join("");
  updateTopicOptions();
}

function updateTopicOptions() {
  const examType = document.getElementById("q-exam-type").value;
  const subject = document.getElementById("q-subject").value;
  const topics = (TOPICS_CATALOG[examType] && TOPICS_CATALOG[examType][subject]) || [];
  document.getElementById("topic-datalist").innerHTML = topics
    .map((t) => `<option value="${escapeHtml(t)}"></option>`)
    .join("");
}

function populateFilterSubjects() {
  const allSubjects = new Set();
  Object.values(TOPICS_CATALOG).forEach((subjMap) => {
    Object.keys(subjMap).forEach((s) => allSubjects.add(s));
  });
  const optionsHtml =
    `<option value="ALL">Tüm Dersler</option>` +
    Array.from(allSubjects)
      .sort()
      .map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`)
      .join("");
  document.getElementById("filter-subject").innerHTML = optionsHtml;
  const scoresSubj = document.getElementById("scores-subject-filter");
  if (scoresSubj) scoresSubj.innerHTML = optionsHtml;
  const remSubj = document.getElementById("rem-subject-filter");
  if (remSubj) remSubj.innerHTML = optionsHtml;
}

/* ---------- Ana Sayfa ---------- */

async function loadDashboard() {
  const data = await apiFetch("/api/dashboard");
  const s = data.stats;

  document.getElementById("stat-active").textContent = s.active_total;
  document.getElementById("stat-split").textContent = `TYT: ${s.tyt_total} • AYT: ${s.ayt_total}`;
  document.getElementById("stat-cleared").textContent = s.cleared_total;
  document.getElementById("stat-avg-score").textContent = s.average_topic_score;
  document.getElementById("stat-exam-ready").textContent = s.weekly_exam_ready
    ? "Hazır ✓"
    : `${s.active_total}/10 Soru`;
  document.getElementById("stat-exam-count").textContent = `Tamamlanan: ${s.completed_mock_exams}`;
  document.getElementById("sidebar-streak").textContent = `${s.streak_days} Gün`;
  document.getElementById("nav-daily-badge").textContent = s.open_missions;

  const todayWrap = document.getElementById("dash-today-missions");
  todayWrap.innerHTML = data.today_missions.length
    ? data.today_missions
        .map(
          (m) => `
          <div class="weak-item">
            <div>
              <strong>${escapeHtml(m.title)}</strong>
              <div class="muted">${m.status === "graded" ? `${m.net_score} Net • ${m.deleted_count} soru temizlendi` : "PDF Hazır • Optik Kodlama Bekliyor"}</div>
            </div>
            <button class="btn btn-sm btn-secondary" onclick="switchTab('daily'); openMissionDetail(${m.id});">
              ${m.status === "graded" ? "Çözümler" : "Optik Kodla"}
            </button>
          </div>`
        )
        .join("")
    : `<p class="muted">Bugün henüz konu föyü oluşturulmadı. Soru eklediğinde <strong>Günlük Görev Föyü</strong> sekmesinden tek tıkla 10 soruluk PDF oluşturabilirsin.</p>`;

  const weakWrap = document.getElementById("dash-weak-topics");
  weakWrap.innerHTML = data.weakest_topics.length
    ? data.weakest_topics
        .map(
          (w) => `
          <div class="weak-item">
            <div>
              <strong>${escapeHtml(w.subject)} — ${escapeHtml(w.topic)}</strong>
              <div class="muted">${w.exam_type}${w.expected_questions ? ` • ~${w.expected_questions} soruda` : ""} • ${w.active_questions} hata${w.expected_questions ? ` (≈${w.estimated_correct}D)` : ""} • ${w.cleared_count} temizlendi</div>
            </div>
            <span class="score-pill ${scoreClass(w.score)}">${w.score}/100</span>
          </div>`
        )
        .join("")
    : `<p class="muted">Aktif hata bulunmuyor — harika gidiyorsun!</p>`;
}

/* ---------- Konu Bazlı Günlük Görev + PDF + Optik Kodlama ---------- */

async function loadDailyHub() {
  const examType = document.getElementById("daily-exam-filter")?.value || "ALL";
  const [readyData, missionsData] = await Promise.all([
    apiFetch(`/api/daily-missions/topics-ready?exam_type=${encodeURIComponent(examType)}`),
    apiFetch("/api/daily-missions"),
  ]);

  const readyGrid = document.getElementById("ready-topics-grid");
  if (!readyData.topics.length) {
    readyGrid.innerHTML = `<p class="muted">Henüz havuzda aktif soru yok. Deneme sorularını eklediğinde burada konu konu 10 soruluk föy oluşturabileceksin.</p>`;
  } else {
    readyGrid.innerHTML = readyData.topics
      .map(
        (t) => `
        <div class="ready-topic-card ${t.ready_for_10 ? "is-ready" : ""}">
          <div class="topic-chips">
            <span class="chip ${t.exam_type === "TYT" ? "chip-tyt" : "chip-ayt"}">${t.exam_type}</span>
            <span class="score-pill ${scoreClass(t.score)}">${t.score}/100</span>
            <span class="chip ${t.ready_for_10 ? "chip-solved" : ""}">
              ${t.ready_for_10 ? `${t.active_questions} Soru (10'luk Hazır ✓)` : `${t.active_questions}/10 Soru`}
            </span>
          </div>
          <div>
            <strong>${escapeHtml(t.subject)}</strong>
            <div style="font-size:14px;">${escapeHtml(t.topic)}</div>
          </div>
          <button class="btn btn-primary btn-sm"
            onclick='createTopicMission(${JSON.stringify(t.exam_type)}, ${JSON.stringify(t.subject)}, ${JSON.stringify(t.topic)})'>
            📄 ${Math.min(10, t.active_questions)} Soruluk Föy & PDF Oluştur
          </button>
        </div>`
      )
      .join("");
  }

  const list = document.getElementById("missions-history-list");
  if (!missionsData.missions.length) {
    list.innerHTML = `<p class="muted">Henüz oluşturulmuş günlük görev föyü yok.</p>`;
  } else {
    list.innerHTML = missionsData.missions
      .map(
        (m) => `
        <div class="weak-item">
          <div>
            <strong>${escapeHtml(m.title)}</strong>
            <div class="muted">
              ${m.mission_date} •
              ${
                m.status === "graded"
                  ? `✅ ${m.net_score} Net (${m.correct_count}D / ${m.wrong_count}Y / ${m.blank_count}B) • 🗑️ ${m.deleted_count} soru DB'den silindi`
                  : `📄 Otomatik PDF Hazır (${escapeHtml(m.pdf_filename || "")})`
              }
            </div>
          </div>
          <div class="header-actions">
            <a class="btn btn-sm btn-secondary" ${missionPdfAttr(m)}>📥 PDF / Föy</a>
            <a class="btn btn-sm btn-secondary" ${missionPrintAttr(m)}>🖨️ Yazdır</a>
            <button class="btn btn-sm btn-primary" onclick="openMissionDetail(${m.id})">
              ${m.status === "graded" ? "💡 Çözümleri Gör" : "✏️ Optik Kodla"}
            </button>
            ${
              m.status === "open"
                ? `<button class="btn btn-sm btn-ghost text-rose" onclick="deleteMission(${m.id})">Sil</button>`
                : ""
            }
          </div>
        </div>`
      )
      .join("");
  }
}

async function createTopicMission(examType, subject, topic) {
  try {
    const data = await apiFetch("/api/daily-missions", {
      method: "POST",
      body: JSON.stringify({ mode: "topic", exam_type: examType, subject, topic, target_count: 10 }),
    });
    showToast("Konu föyü ve PDF dosyası otomatik oluşturuldu!");
    await loadDashboard();
    await loadDailyHub();
    renderMissionDetail(data.mission);
  } catch (err) {
    showToast(err.message);
  }
}

async function createMixedMission(count = 10) {
  try {
    const examType = document.getElementById("daily-exam-filter").value;
    showToast("10 soruluk karma PDF föyü hazırlanıyor...");
    const data = await apiFetch("/api/daily-missions", {
      method: "POST",
      body: JSON.stringify({ mode: "mixed", exam_type: examType, target_count: count }),
    });
    showToast("10 soruluk karma günlük föy ve PDF hazır!");
    await loadDashboard();
    await loadDailyHub();
    renderMissionDetail(data.mission);
  } catch (err) {
    showToast(err.message);
  }
}

async function splitAllIntoSheets() {
  try {
    const examType = document.getElementById("daily-exam-filter").value;
    showToast("Tüm aktif sorular 10'ar soruluk PDF kâğıtlarına bölünüyor...");
    const data = await apiFetch("/api/daily-missions", {
      method: "POST",
      body: JSON.stringify({ mode: "split_all", exam_type: examType, target_count: 10 }),
    });
    showToast(`${data.missions.length} adet hazır günlük PDF kâğıdı oluşturuldu!`);
    await loadDashboard();
    await loadDailyHub();
  } catch (err) {
    showToast(err.message);
  }
}

async function createAllInOneSheet() {
  try {
    const examType = document.getElementById("daily-exam-filter").value;
    showToast("Tüm sorular tek PDF kitapçığında hazırlanıyor...");
    const data = await apiFetch("/api/daily-missions", {
      method: "POST",
      body: JSON.stringify({ mode: "all", exam_type: examType, include_assigned: true }),
    });
    showToast("Tüm soruların tek PDF kâğıdı hazır!");
    await loadDashboard();
    await loadDailyHub();
    renderMissionDetail(data.mission);
  } catch (err) {
    showToast(err.message);
  }
}

async function deleteMission(missionId) {
  if (!confirm("Bu föyü silmek istediğine emin misin? (Sorular havuzda kalır)")) return;
  await apiFetch(`/api/daily-missions/${missionId}`, { method: "DELETE" });
  showToast("Föy silindi.");
  await loadDashboard();
  await loadDailyHub();
}

async function openMissionDetail(missionId) {
  const data = await apiFetch(`/api/daily-missions/${missionId}`);
  renderMissionDetail(data.mission);
}

function renderMissionDetail(m) {
  ACTIVE_MISSION = m;
  OPTICAL_ANSWERS = {};
  m.items.forEach((it) => {
    OPTICAL_ANSWERS[it.id] = {
      user_answer: it.user_answer || "",
      self_result: null,
    };
  });

  document.getElementById("daily-hub-view").classList.add("hidden");
  document.getElementById("daily-detail-view").classList.remove("hidden");

  document.getElementById("mission-detail-title").textContent = m.title;
  document.getElementById("mission-detail-meta").textContent =
    `Tarih: ${m.mission_date} • Otomatik PDF: gunluk_gorevler/${m.pdf_filename || ""}`;
  const pdfLink = document.getElementById("mission-pdf-link");
  const printLink = document.getElementById("mission-print-link");
  if (window.ASYA_STATIC_MODE) {
    pdfLink.href = "#";
    printLink.href = "#";
    pdfLink.removeAttribute("target");
    printLink.removeAttribute("target");
    pdfLink.onclick = (e) => { e.preventDefault(); window.openStaticMissionPrint(m.id); };
    printLink.onclick = (e) => { e.preventDefault(); window.openStaticMissionPrint(m.id); };
  } else {
    pdfLink.href = m.pdf_url;
    printLink.href = m.print_url;
    pdfLink.onclick = null;
    printLink.onclick = null;
  }

  const isGraded = m.status === "graded";
  document.getElementById("optical-form-card").classList.toggle("hidden", isGraded);

  const banner = document.getElementById("mission-graded-banner");
  if (isGraded) {
    banner.classList.remove("hidden");
    banner.innerHTML = `
      <h3>🎉 Görev Değerlendirildi!</h3>
      <p style="margin-top:6px;font-size:16px;">
        <strong>${m.net_score} Net</strong> —
        <span class="text-emerald"><strong>${m.correct_count} Doğru</strong></span> •
        <span class="text-rose"><strong>${m.wrong_count} Yanlış</strong></span> •
        <span class="text-amber"><strong>${m.blank_count} Boş</strong></span>
      </p>
      <p class="muted" style="margin-top:6px;">
        🗑️ <strong>${m.deleted_count} doğru soru</strong> veritabanından kalıcı olarak silindi (bir daha karşına çıkmayacak). Yanlış ve boş sorular havuzda tutuldu. Tüm çözümleri aşağıda inceleyebilirsin!
      </p>`;
  } else {
    banner.classList.add("hidden");
    renderOpticalGrid(m.items);
  }

  renderMissionItems(m.items, isGraded);
}

function renderOpticalGrid(items) {
  const grid = document.getElementById("optical-grid");
  grid.innerHTML = items
    .map((it, idx) => {
      if (it.has_answer_key) {
        const opts = ["A", "B", "C", "D", "E"]
          .map(
            (letter) =>
              `<button type="button" class="bubble-btn" onclick="pickOptical(${it.id}, '${letter}', this)">${letter}</button>`
          )
          .join("");
        return `
          <div class="optical-row">
            <span class="optical-qnum">Soru ${idx + 1}</span>
            <div class="optical-bubbles">
              ${opts}
              <button type="button" class="bubble-btn blank-btn selected" onclick="pickOptical(${it.id}, '', this)">Boş</button>
            </div>
          </div>`;
      }
      return `
        <div class="optical-row">
          <span class="optical-qnum">Soru ${idx + 1}</span>
          <div class="optical-bubbles">
            <button type="button" class="bubble-btn blank-btn" onclick="pickOpticalSelf(${it.id}, 'correct', this)">✓ Doğru</button>
            <button type="button" class="bubble-btn blank-btn" onclick="pickOpticalSelf(${it.id}, 'wrong', this)">✕ Yanlış</button>
            <button type="button" class="bubble-btn blank-btn selected" onclick="pickOpticalSelf(${it.id}, 'blank', this)">Boş</button>
          </div>
        </div>`;
    })
    .join("");
}

function pickOptical(itemId, letter, btn) {
  btn.parentElement.querySelectorAll(".bubble-btn").forEach((b) => b.classList.remove("selected"));
  btn.classList.add("selected");
  OPTICAL_ANSWERS[itemId] = { user_answer: letter, self_result: null };
}

function pickOpticalSelf(itemId, res, btn) {
  btn.parentElement.querySelectorAll(".bubble-btn").forEach((b) => b.classList.remove("selected"));
  btn.classList.add("selected");
  OPTICAL_ANSWERS[itemId] = { user_answer: "", self_result: res };
}

async function submitOpticalForm() {
  if (!ACTIVE_MISSION) return;
  const answers = ACTIVE_MISSION.items.map((it) => {
    const a = OPTICAL_ANSWERS[it.id] || {};
    return {
      item_id: it.id,
      user_answer: a.user_answer || "",
      self_result: a.self_result || null,
    };
  });

  try {
    const data = await apiFetch(`/api/daily-missions/${ACTIVE_MISSION.id}/grade`, {
      method: "POST",
      body: JSON.stringify({ answers }),
    });
    showToast(`Değerlendirildi! ${data.mission.deleted_count} doğru soru veritabanından temizlendi.`);
    renderMissionDetail(data.mission);
    await Promise.all([loadDashboard(), loadScores(), loadQuestions()]);
  } catch (err) {
    showToast(err.message);
  }
}

function renderQuestionContentHtml(it) {
  let html = "";
  if (it.svg_markup) {
    html += `<div class="q-svg-wrap">${it.svg_markup}</div>`;
  }
  const opts = it.options || {};
  const hasOpts = ["A", "B", "C", "D", "E"].some((k) => opts[k]);
  if (it.question_text || hasOpts) {
    const optsList = hasOpts
      ? `<ul class="digital-options">${["A", "B", "C", "D", "E"]
          .filter((k) => opts[k])
          .map((k) => `<li><strong>${k})</strong> ${escapeHtml(opts[k])}</li>`)
          .join("")}</ul>`
      : "";
    html += `
      <div class="digital-question">
        ${it.question_text ? `<div>${escapeHtml(it.question_text).replaceAll("\n", "<br/>")}</div>` : ""}
        ${optsList}
      </div>`;
  }
  return html;
}

function renderMissionItems(items, isGraded) {
  const container = document.getElementById("mission-items-list");
  container.innerHTML = items
    .map((it, idx) => {
      const hasImg = Boolean(it.image_filename);
      const stateCls =
        it.result === "correct"
          ? "done-correct"
          : it.result === "wrong"
          ? "done-wrong"
          : "";

      const gradedBadges = isGraded
        ? `
          <div class="topic-chips">
            <span class="chip ${it.result === "correct" ? "chip-solved" : it.result === "wrong" ? "chip-yanlis" : "chip-bos"}">
              ${it.result === "correct" ? "✓ Doğru" : it.result === "wrong" ? "✕ Yanlış" : "○ Boş"}
            </span>
            <span class="chip">Senin Cevabın: ${escapeHtml(it.user_answer || "Boş")}</span>
            ${it.correct_answer ? `<span class="chip chip-tyt">Doğru Şık: ${escapeHtml(it.correct_answer)}</span>` : ""}
            ${it.deleted_from_db ? `<span class="chip chip-solved">🗑️ Veritabanından Silindi</span>` : `<span class="chip chip-bos">📌 Havuzda Kaldı</span>`}
          </div>
          <div class="solution-box">
            <strong class="sol-title">💡 Detaylı Çözüm</strong>
            <div>${
              it.solution
                ? escapeHtml(it.solution).replaceAll("\n", "<br/>")
                : "Bu soru için çözüm metni henüz eklenmedi."
            }</div>
          </div>`
        : "";

      return `
        <div class="mission-card ${hasImg ? "" : "single-col"} ${stateCls}">
          ${
            hasImg
              ? `<img class="question-thumb" src="${uploadUrl(it.image_filename)}" alt="Soru ${idx + 1}" onclick="openLightbox(this.src)" />`
              : ""
          }
          <div class="mission-body">
            <div class="topic-chips">
              <span class="chip">Soru #${idx + 1}</span>
              <span class="chip ${it.exam_type === "TYT" ? "chip-tyt" : "chip-ayt"}">${it.exam_type}</span>
              <span class="chip">${escapeHtml(it.subject)} — ${escapeHtml(it.topic)}</span>
              ${it.exam_name ? `<span class="chip">${escapeHtml(it.exam_name)}</span>` : ""}
            </div>
            ${renderQuestionContentHtml(it)}
            ${gradedBadges}
          </div>
        </div>`;
    })
    .join("");

  renderMath(container);
}

function closeMissionDetail() {
  document.getElementById("daily-detail-view").classList.add("hidden");
  document.getElementById("daily-hub-view").classList.remove("hidden");
  loadDailyHub();
}

/* ---------- Konu Puanları ---------- */

function scoreClass(score) {
  if (score < 50) return "score-kritik";
  if (score < 80) return "score-gelisiyor";
  return "score-guclu";
}

async function loadScores() {
  const examType = document.getElementById("scores-exam-filter").value;
  const mode = document.getElementById("scores-mode")?.value || "all";
  const subject = document.getElementById("scores-subject-filter")?.value || "ALL";
  const includeAll = mode === "all";
  const data = await apiFetch(
    `/api/scores?exam_type=${encodeURIComponent(examType)}&include_all=${includeAll}&subject=${encodeURIComponent(subject)}`
  );

  const subjGrid = document.getElementById("subject-summary-grid");
  subjGrid.innerHTML = data.subject_summary
    .map(
      (s) => `
      <div class="subject-card">
        <div class="muted">${s.exam_type} • ${s.exam_count > 0 ? `${s.exam_count} Deneme (~${s.expected_questions} soru)` : `${s.topic_count} konu (Deneme yok)`}</div>
        <h4 style="margin:4px 0;">${escapeHtml(s.subject)}</h4>
        ${s.exam_count > 0 ? `<div class="muted" style="font-size:11.5px;margin-bottom:6px;">${s.active_mistakes} hata • ≈${s.estimated_correct} doğru</div>` : ""}
        <span class="score-pill ${scoreClass(s.average_score)}">${s.average_score} / 100</span>
      </div>`
    )
    .join("");

  const listWrap = document.getElementById("topic-scores-list");
  if (!data.topic_scores.length) {
    listWrap.innerHTML = `<p class="muted">Gösterilecek konu bulunamadı.</p>`;
    return;
  }

  listWrap.innerHTML = data.topic_scores
    .map(
      (t) => `
      <div class="score-row">
        <span class="chip ${t.exam_type === "TYT" ? "chip-tyt" : "chip-ayt"}">${t.exam_type}</span>
        <strong>${escapeHtml(t.subject)}</strong>
        <div>
          <div style="font-weight:600;">${escapeHtml(t.topic)}</div>
          <div class="muted">${
            t.exam_count > 0 && t.expected_questions > 0
              ? `${t.exam_count} Deneme (~${t.expected_questions} soru) • ≈${t.estimated_correct}D • `
              : ""
          }Aktif: ${t.unsolved_wrong}Y / ${t.unsolved_blank}B • Temizlenen: ${t.cleared_count}</div>
        </div>
        <div class="progress-bar">
          <div class="progress-fill" style="width:${t.score}%"></div>
        </div>
        <span class="chip">${t.level}</span>
        <span class="score-pill ${scoreClass(t.score)}">${t.score} / 100</span>
      </div>`
    )
    .join("");
}

/* ---------- Haftalık Deneme ---------- */

async function loadMockExams() {
  const data = await apiFetch("/api/mock-exams");
  const list = document.getElementById("mock-history-list");
  if (!data.exams.length) {
    list.innerHTML = `<p class="muted">Henüz oluşturulmuş bir deneme yok.</p>`;
    return;
  }

  list.innerHTML = data.exams
    .map(
      (ex) => `
      <div class="weak-item" style="margin-bottom:8px;">
        <div>
          <strong>${escapeHtml(ex.title)}</strong>
          <div class="muted">${ex.exam_filter} • ${ex.question_count} Soru • ${ex.created_at}</div>
        </div>
        <div style="display:flex;align-items:center;gap:10px;">
          ${
            ex.status === "completed"
              ? `<span class="score-pill score-guclu">${ex.net_score} Net (${ex.correct_count}D / ${ex.wrong_count}Y / ${ex.blank_count}B)</span>`
              : `<span class="score-pill score-gelisiyor">Devam Ediyor</span>`
          }
          <button class="btn btn-sm btn-secondary" onclick="openMockExam(${ex.id})">
            ${ex.status === "completed" ? "İncele" : "Devam Et"}
          </button>
        </div>
      </div>`
    )
    .join("");
}

async function createMockExam() {
  try {
    const payload = {
      title: document.getElementById("mock-title").value,
      exam_filter: document.getElementById("mock-exam-filter").value,
      question_count: parseInt(document.getElementById("mock-count").value, 10),
    };
    const data = await apiFetch("/api/mock-exams", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    startMockRunner(data);
  } catch (err) {
    showToast(err.message);
  }
}

async function openMockExam(examId) {
  const data = await apiFetch(`/api/mock-exams/${examId}`);
  startMockRunner(data);
}

function startMockRunner(data) {
  ACTIVE_MOCK_EXAM = data;
  MOCK_ANSWERS = {};
  data.items.forEach((it) => {
    MOCK_ANSWERS[it.item_id] = {
      user_answer: it.user_answer || "",
      result: it.result !== "pending" ? it.result : null,
    };
  });

  document.getElementById("mock-setup-view").classList.add("hidden");
  document.getElementById("mock-runner-view").classList.remove("hidden");
  document.getElementById("runner-title").textContent = data.exam.title;
  document.getElementById("runner-meta").textContent = `${data.exam.exam_filter} • ${data.items.length} Soru`;

  const isCompleted = data.exam.status === "completed";
  document.getElementById("runner-submit-bar").classList.toggle("hidden", isCompleted);

  clearInterval(MOCK_TIMER_INTERVAL);
  MOCK_ELAPSED_SECONDS = data.exam.duration_seconds || 0;
  updateTimerDisplay();
  if (!isCompleted) {
    MOCK_TIMER_INTERVAL = setInterval(() => {
      MOCK_ELAPSED_SECONDS += 1;
      updateTimerDisplay();
    }, 1000);
  }

  renderMockRunnerQuestions(data.items, isCompleted);

  const summaryEl = document.getElementById("runner-result-summary");
  if (isCompleted) {
    summaryEl.classList.remove("hidden");
    summaryEl.innerHTML = `
      <h3>🎉 Deneme Sonucu</h3>
      <p style="margin-top:8px;font-size:18px;">
        <strong>${data.exam.net_score} Net</strong> —
        <span class="text-emerald">${data.exam.correct_count} Doğru</span> •
        <span class="text-rose">${data.exam.wrong_count} Yanlış</span> •
        <span class="text-amber">${data.exam.blank_count} Boş</span>
      </p>`;
  } else {
    summaryEl.classList.add("hidden");
  }
}

function updateTimerDisplay() {
  const mins = String(Math.floor(MOCK_ELAPSED_SECONDS / 60)).padStart(2, "0");
  const secs = String(MOCK_ELAPSED_SECONDS % 60).padStart(2, "0");
  document.getElementById("runner-timer").textContent = `⏱️ ${mins}:${secs}`;
}

function renderMockRunnerQuestions(items, isCompleted) {
  const container = document.getElementById("runner-questions-list");
  container.innerHTML = items
    .map((it, idx) => {
      const hasImg = Boolean(it.image_filename);
      const ans = MOCK_ANSWERS[it.item_id] || {};
      const controlsHtml = it.has_answer_key
        ? ["A", "B", "C", "D", "E"]
            .map(
              (opt) => `
              <button type="button"
                class="opt-btn ${ans.user_answer === opt ? "selected" : ""}"
                ${isCompleted ? "disabled" : ""}
                onclick="selectMockOption(${it.item_id}, '${opt}', this)">
                ${opt}
              </button>`
            )
            .join("")
        : [
            { val: "correct", label: "✓ Doğru" },
            { val: "wrong", label: "✕ Yanlış" },
            { val: "blank", label: "○ Boş" },
          ]
            .map(
              (opt) => `
              <button type="button"
                class="opt-btn ${ans.result === opt.val ? "selected" : ""}"
                ${isCompleted ? "disabled" : ""}
                onclick="selectMockSelfGrade(${it.item_id}, '${opt.val}', this)">
                ${opt.label}
              </button>`
            )
            .join("");

      return `
        <div class="mission-card ${hasImg ? "" : "single-col"}">
          ${
            hasImg
              ? `<img class="question-thumb" src="${uploadUrl(it.image_filename)}" alt="Soru ${idx + 1}" onclick="openLightbox(this.src)" />`
              : ""
          }
          <div class="mission-body">
            <div class="topic-chips">
              <span class="chip">Soru ${idx + 1}</span>
              <span class="chip ${it.exam_type === "TYT" ? "chip-tyt" : "chip-ayt"}">${it.exam_type}</span>
              <span class="chip">${escapeHtml(it.subject)} — ${escapeHtml(it.topic)}</span>
            </div>
            ${renderQuestionContentHtml(it)}
            <div class="answer-options">${controlsHtml}</div>
            ${
              isCompleted
                ? `<div class="solution-box">
                     <strong class="sol-title">Sonuç: ${escapeHtml(it.result.toUpperCase())}${it.correct_answer ? ` • Doğru Şık: ${escapeHtml(it.correct_answer)}` : ""}</strong>
                     <div>${it.solution ? escapeHtml(it.solution).replaceAll("\n", "<br/>") : "Çözüm metni eklenmedi."}</div>
                   </div>`
                : ""
            }
          </div>
        </div>`;
    })
    .join("");
  renderMath(container);
}

function selectMockOption(itemId, opt, btn) {
  const parent = btn.parentElement;
  const already = btn.classList.contains("selected");
  parent.querySelectorAll(".opt-btn").forEach((b) => b.classList.remove("selected"));
  if (!already) {
    btn.classList.add("selected");
    MOCK_ANSWERS[itemId] = { user_answer: opt, result: null };
  } else {
    MOCK_ANSWERS[itemId] = { user_answer: "", result: "blank" };
  }
}

function selectMockSelfGrade(itemId, grade, btn) {
  const parent = btn.parentElement;
  parent.querySelectorAll(".opt-btn").forEach((b) => b.classList.remove("selected"));
  btn.classList.add("selected");
  MOCK_ANSWERS[itemId] = { user_answer: "", result: grade };
}

async function submitMockExam() {
  if (!ACTIVE_MOCK_EXAM) return;
  clearInterval(MOCK_TIMER_INTERVAL);
  const answers = ACTIVE_MOCK_EXAM.items.map((it) => {
    const a = MOCK_ANSWERS[it.item_id] || {};
    return {
      item_id: it.item_id,
      user_answer: a.user_answer || "",
      result: a.result || null,
    };
  });

  const data = await apiFetch(`/api/mock-exams/${ACTIVE_MOCK_EXAM.exam.id}/submit`, {
    method: "POST",
    body: JSON.stringify({ duration_seconds: MOCK_ELAPSED_SECONDS, answers }),
  });
  showToast(`Deneme tamamlandı! Netin: ${data.exam.net_score}`);
  startMockRunner(data);
  await Promise.all([loadDashboard(), loadScores(), loadQuestions()]);
}

function closeMockRunner() {
  clearInterval(MOCK_TIMER_INTERVAL);
  document.getElementById("mock-runner-view").classList.add("hidden");
  document.getElementById("mock-setup-view").classList.remove("hidden");
  loadMockExams();
}

/* ---------- Aktif Soru Havuzu ---------- */

async function loadQuestions() {
  const params = new URLSearchParams({
    exam_type: document.getElementById("filter-exam").value,
    subject: document.getElementById("filter-subject").value,
    mistake_type: document.getElementById("filter-mistake").value,
    search: document.getElementById("filter-search").value,
  });

  const data = await apiFetch(`/api/questions?${params.toString()}`);
  const grid = document.getElementById("questions-grid");

  if (!data.questions.length) {
    grid.innerHTML = `<div class="card"><p class="muted">Aktif havuzda soru yok. "+ Yeni Soru Ekle" ile veya fotoları bana atarak ekleyebilirsin.</p></div>`;
    return;
  }

  grid.innerHTML = data.questions
    .map(
      (q) => `
      <div class="q-card">
        ${
          q.image_filename
            ? `<img src="${uploadUrl(q.image_filename)}" alt="Soru" onclick="openLightbox(this.src)" />`
            : q.svg_markup
            ? `<div style="padding:10px;background:#ffffff;border-bottom:1px solid var(--border);height:190px;display:flex;align-items:center;justify-content:center;overflow:hidden;">
                 <div style="max-width:100%;max-height:170px;width:100%;display:flex;justify-content:center;">${q.svg_markup}</div>
               </div>`
            : `<div style="padding:14px;background:#fafbff;border-bottom:1px solid var(--border);font-size:13px;height:190px;overflow:hidden;line-height:1.5;">
                 ${escapeHtml(q.question_text || "").slice(0, 260)}
               </div>`
        }
        <div class="q-card-body">
          <div class="topic-chips">
            <span class="chip ${q.exam_type === "TYT" ? "chip-tyt" : "chip-ayt"}">${q.exam_type}</span>
            <span class="chip ${q.mistake_type === "yanlis" ? "chip-yanlis" : "chip-bos"}">
              ${q.mistake_type === "yanlis" ? "Yanlış" : "Boş"}
            </span>
            ${q.correct_answer ? `<span class="chip chip-solved">Şık: ${escapeHtml(q.correct_answer)}</span>` : ""}
            ${q.solution ? `<span class="chip">💡 Çözümlü</span>` : ""}
          </div>
          <strong>${escapeHtml(q.subject)} — ${escapeHtml(q.topic)}</strong>
          ${q.exam_name ? `<div class="muted">${escapeHtml(q.exam_name)}</div>` : ""}
          <div class="q-card-footer">
            <span class="muted">Tekrar: ${q.times_reviewed}</span>
            <button class="btn btn-sm btn-ghost text-rose" onclick="deleteQuestion(${q.id})">Sil</button>
          </div>
        </div>
      </div>`
    )
    .join("");
  renderMath(grid);
}

async function deleteQuestion(id) {
  if (!confirm("Bu soruyu silmek istediğine emin misin?")) return;
  await apiFetch(`/api/questions/${id}`, { method: "DELETE" });
  showToast("Soru silindi.");
  await refreshAll();
}

function openUploadModal() {
  document.getElementById("upload-modal").classList.remove("hidden");
}

function closeUploadModal() {
  document.getElementById("upload-modal").classList.add("hidden");
  document.getElementById("upload-form").reset();
  PENDING_IMAGE_DATA = null;
  PENDING_IMAGE_NAME = null;
  document.getElementById("ss-preview").classList.add("hidden");
  document.getElementById("dropzone-placeholder").classList.remove("hidden");
  updateSubjectOptions();
}

function setupDropzoneAndPaste() {
  const dz = document.getElementById("dropzone");
  dz.addEventListener("dragover", (e) => {
    e.preventDefault();
    dz.style.borderColor = "var(--primary)";
  });
  dz.addEventListener("dragleave", () => {
    dz.style.borderColor = "var(--border)";
  });
  dz.addEventListener("drop", (e) => {
    e.preventDefault();
    dz.style.borderColor = "var(--border)";
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      readImageFile(e.dataTransfer.files[0]);
    }
  });

  document.addEventListener("paste", (e) => {
    const modal = document.getElementById("upload-modal");
    if (modal.classList.contains("hidden")) return;
    const items = e.clipboardData?.items || [];
    for (const item of items) {
      if (item.type.startsWith("image/")) {
        readImageFile(item.getAsFile());
        break;
      }
    }
  });
}

function handleFileSelect(e) {
  if (e.target.files && e.target.files[0]) {
    readImageFile(e.target.files[0]);
  }
}

function readImageFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    PENDING_IMAGE_DATA = reader.result;
    PENDING_IMAGE_NAME = file.name || "screenshot.png";
    const img = document.getElementById("ss-preview");
    img.src = PENDING_IMAGE_DATA;
    img.classList.remove("hidden");
    document.getElementById("dropzone-placeholder").classList.add("hidden");
  };
  reader.readAsDataURL(file);
}

async function submitQuestion(e) {
  e.preventDefault();
  const qText = document.getElementById("q-text").value.trim();
  if (!PENDING_IMAGE_DATA && !qText) {
    showToast("Soru için ya görsel (SS) ya da temiz soru metni girmelisin.");
    return;
  }

  const payload = {
    exam_type: document.getElementById("q-exam-type").value,
    subject: document.getElementById("q-subject").value,
    topic: document.getElementById("q-topic").value,
    mistake_type: document.getElementById("q-mistake-type").value,
    correct_answer: document.getElementById("q-correct-answer").value,
    exam_name: document.getElementById("q-exam-name").value,
    question_text: qText,
    solution: document.getElementById("q-solution").value.trim(),
    image_data: PENDING_IMAGE_DATA,
    image_filename: PENDING_IMAGE_NAME,
  };

  try {
    await apiFetch("/api/questions", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    showToast("Soru başarıyla havuza eklendi!");
    closeUploadModal();
    await loadTopics();
    await refreshAll();
  } catch (err) {
    showToast(err.message);
  }
}

/* ---------- Bilgi Kartları (3D Çevirmeli Flashcard + Poster Duvarı + Bölüm Sistemi) ---------- */

const SUBJECT_THEMES = {
  Kimya: { accent: "#7c3aed", soft: "#f5f3ff", emoji: "🧪" },
  Fizik: { accent: "#2563eb", soft: "#eff6ff", emoji: "⚡" },
  Biyoloji: { accent: "#059669", soft: "#ecfdf5", emoji: "🧬" },
  Türkçe: { accent: "#ea580c", soft: "#fff7ed", emoji: "✍️" },
  Matematik: { accent: "#0891b2", soft: "#ecfeff", emoji: "➗" },
  Geometri: { accent: "#4f46e5", soft: "#eef2ff", emoji: "📐" },
  Tarih: { accent: "#b91c1c", soft: "#fef2f2", emoji: "🏛️" },
  Coğrafya: { accent: "#d97706", soft: "#fffbeb", emoji: "🌍" },
};

let REMINDER_STATE = {
  mode: "flashcard", // 'flashcard' | 'wall'
  batchNo: null, // null = ALL, or 1, 2, ...
  items: [],
  batches: [],
  deck: [],
  index: 0,
  flipped: false,
  streak: 0,
  unprintedCount: 0,
  unmasteredCount: 0,
  totalCount: 0,
};

function getSubjectTheme(subject) {
  return SUBJECT_THEMES[subject] || { accent: "#4f46e5", soft: "#eef2ff", emoji: "📌" };
}

function setReminderMode(mode) {
  REMINDER_STATE.mode = mode;
  document.getElementById("btn-mode-flashcard")?.classList.toggle("active", mode === "flashcard");
  document.getElementById("btn-mode-wall")?.classList.toggle("active", mode === "wall");
  document.getElementById("flashcard-stage")?.classList.toggle("hidden", mode !== "flashcard");
  document.getElementById("reminders-grid")?.classList.toggle("hidden", mode !== "wall");
  if (mode === "flashcard") {
    renderFlashcardStage();
  } else {
    renderRemindersWall();
  }
}

function selectReminderBatch(batchNo) {
  REMINDER_STATE.batchNo = batchNo;
  loadReminders();
}

async function loadReminders() {
  const examType = document.getElementById("rem-exam-filter")?.value || "ALL";
  const subject = document.getElementById("rem-subject-filter")?.value || "ALL";
  const onlyUnmastered = document.getElementById("rem-only-unmastered")?.checked || false;

  const params = new URLSearchParams({
    exam_type: examType,
    subject,
    only_unmastered: String(onlyUnmastered),
  });
  if (REMINDER_STATE.batchNo) {
    params.set("batch_no", String(REMINDER_STATE.batchNo));
  }
  const data = await apiFetch(`/api/reminders?${params.toString()}`);

  REMINDER_STATE.items = data.reminders || [];
  REMINDER_STATE.batches = data.batches || [];
  REMINDER_STATE.unprintedCount = data.unprinted_count || 0;
  REMINDER_STATE.unmasteredCount = data.unmastered_count || 0;
  REMINDER_STATE.totalCount = data.total_count || REMINDER_STATE.items.length;
  REMINDER_STATE.deck = [...REMINDER_STATE.items];
  REMINDER_STATE.index = 0;
  REMINDER_STATE.flipped = false;

  const badge = document.getElementById("nav-rem-badge");
  if (badge) badge.textContent = data.unmastered_count ?? REMINDER_STATE.items.length;

  renderReminderBatchPills();
  renderReminderExportBar();

  if (REMINDER_STATE.mode === "flashcard") {
    renderFlashcardStage();
  } else {
    renderRemindersWall();
  }
}

function renderReminderBatchPills() {
  const wrap = document.getElementById("rem-batch-pills");
  if (!wrap) return;

  const pills = [
    `<button class="batch-pill ${REMINDER_STATE.batchNo === null ? "active" : ""}" onclick="selectReminderBatch(null)">
      📚 Tümü (${REMINDER_STATE.totalCount})
    </button>`,
  ];

  for (const b of REMINDER_STATE.batches) {
    const active = REMINDER_STATE.batchNo === b.batch_no ? "active" : "";
    const tag = b.is_printed
      ? `<span class="batch-pill-tag is-done">✓ Çıktı Alındı</span>`
      : `<span class="batch-pill-tag is-new">🆕 Yeni (${b.unprinted_count})</span>`;
    pills.push(
      `<button class="batch-pill ${active}" onclick="selectReminderBatch(${b.batch_no})">
        📑 Bölüm ${b.batch_no} (${b.total}) ${tag}
      </button>`
    );
  }
  wrap.innerHTML = pills.join("");
}

function renderReminderExportBar() {
  const wrap = document.getElementById("rem-export-actions");
  if (!wrap) return;

  const latestUnprintedBatch = [...REMINDER_STATE.batches].reverse().find((b) => !b.is_printed);
  const selectedBatch = REMINDER_STATE.batchNo;

  const btns = [];
  if (selectedBatch) {
    const bObj = REMINDER_STATE.batches.find((b) => b.batch_no === selectedBatch);
    btns.push(
      `<a class="btn btn-primary btn-sm" ${reminderPdfAttr("batch", selectedBatch)}>
        📥 Bölüm ${selectedBatch} Poster / PDF (${bObj ? bObj.total : ""} Kart)
      </a>`
    );
    if (bObj && !bObj.is_printed) {
      btns.push(
        `<button class="btn btn-success btn-sm" onclick="markBatchPrinted(${selectedBatch}, true)">
          🖨️ Bölüm ${selectedBatch} Yazdırıldı ✓
        </button>`
      );
    } else if (bObj && bObj.is_printed) {
      btns.push(
        `<button class="btn btn-ghost btn-sm" onclick="markBatchPrinted(${selectedBatch}, false)">
          ↩️ Yazdırılmadı Yap
        </button>`
      );
    }
  } else if (latestUnprintedBatch) {
    btns.push(
      `<a class="btn btn-primary btn-sm" ${reminderPdfAttr("batch", latestUnprintedBatch.batch_no)}>
        🆕 Sadece Yeni Bölüm ${latestUnprintedBatch.batch_no} Poster (${latestUnprintedBatch.total} Kart)
      </a>`
    );
    btns.push(
      `<button class="btn btn-success btn-sm" onclick="markBatchPrinted(${latestUnprintedBatch.batch_no}, true)">
        🖨️ Bölüm ${latestUnprintedBatch.batch_no} Yazdırıldı ✓
      </button>`
    );
  }

  btns.push(
    `<a class="btn btn-secondary btn-sm" ${reminderPdfAttr("final", null)} title="Öğrendiklerin hariç, sadece hâlâ tekrar gerekenlerin temiz final posteri">
      🏆 Final Sürümü Poster (${REMINDER_STATE.unmasteredCount} Kart)
    </a>`
  );
  btns.push(
    `<a class="btn btn-ghost btn-sm" ${reminderPdfAttr("archive", null)} title="Tüm bölümlerin birleştirilmiş tam arşivi">
      📚 Tam Arşiv
    </a>`
  );

  wrap.innerHTML = btns.join("");
}

async function markBatchPrinted(batchNo, printed) {
  await apiFetch(`/api/reminders/batches/${batchNo}/mark-printed?printed=${printed}`, {
    method: "POST",
  });
  showToast(
    printed
      ? `Bölüm ${batchNo} yazdırıldı olarak işaretlendi! Bir dahaki sefere sadece yeni gelenleri basarsın.`
      : `Bölüm ${batchNo} tekrar yazdırılacak olarak işaretlendi.`
  );
  await loadReminders();
}

function shuffleFlashcards() {
  const arr = [...REMINDER_STATE.deck];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  REMINDER_STATE.deck = arr;
  REMINDER_STATE.index = 0;
  REMINDER_STATE.flipped = false;
  if (REMINDER_STATE.mode !== "flashcard") {
    setReminderMode("flashcard");
  } else {
    renderFlashcardStage();
  }
  showToast("🔀 Deste karıştırıldı!");
}

function flipCurrentFlashcard() {
  const cardEl = document.getElementById("active-fc-card");
  if (!cardEl) return;
  REMINDER_STATE.flipped = !REMINDER_STATE.flipped;
  cardEl.classList.toggle("is-flipped", REMINDER_STATE.flipped);
}

function nextFlashcardLater() {
  if (!REMINDER_STATE.deck.length) return;
  const current = REMINDER_STATE.deck.splice(REMINDER_STATE.index, 1)[0];
  REMINDER_STATE.deck.push(current);
  if (REMINDER_STATE.index >= REMINDER_STATE.deck.length) {
    REMINDER_STATE.index = 0;
  }
  REMINDER_STATE.streak = 0;
  REMINDER_STATE.flipped = false;
  renderFlashcardStage();
}

async function masterCurrentFlashcard() {
  if (!REMINDER_STATE.deck.length) return;
  const current = REMINDER_STATE.deck[REMINDER_STATE.index];
  await apiFetch(`/api/reminders/${current.id}`, {
    method: "PATCH",
    body: JSON.stringify({ mastered: true }),
  });
  REMINDER_STATE.streak += 1;
  REMINDER_STATE.unmasteredCount = Math.max(0, REMINDER_STATE.unmasteredCount - 1);
  const badge = document.getElementById("nav-rem-badge");
  if (badge) badge.textContent = REMINDER_STATE.unmasteredCount;

  // Desteden çıkar ve sıradakine geç
  REMINDER_STATE.deck.splice(REMINDER_STATE.index, 1);
  if (REMINDER_STATE.index >= REMINDER_STATE.deck.length) {
    REMINDER_STATE.index = 0;
  }
  REMINDER_STATE.flipped = false;
  showToast(`🔥 Harika Asya! "${current.title}" öğrenildi! (Seri: ${REMINDER_STATE.streak})`);
  renderReminderExportBar();
  renderFlashcardStage();
}

function stepFlashcard(delta) {
  if (!REMINDER_STATE.deck.length) return;
  REMINDER_STATE.index = (REMINDER_STATE.index + delta + REMINDER_STATE.deck.length) % REMINDER_STATE.deck.length;
  REMINDER_STATE.flipped = false;
  renderFlashcardStage();
}

function renderFlashcardStage() {
  const stage = document.getElementById("flashcard-stage");
  if (!stage) return;

  if (!REMINDER_STATE.deck.length) {
    stage.innerHTML = `
      <div class="card" style="max-width:560px;width:100%;text-align:center;padding:34px 24px;">
        <div style="font-size:46px;margin-bottom:8px;">🏆</div>
        <h3 style="margin:0 0 8px 0;">Bu destedeki tüm kartları temizledin!</h3>
        <p class="muted" style="margin:0 0 18px 0;">İstersen "Sadece Henüz Öğrenilmemişler" tikini kaldırıp tüm arşivi tekrar gezebilir veya başka bir ders/bölüm seçebilirsin.</p>
        <button class="btn btn-primary" onclick="document.getElementById('rem-only-unmastered').checked=false; loadReminders();">
          🔄 Tüm Kartları Göster
        </button>
      </div>`;
    return;
  }

  const card = REMINDER_STATE.deck[REMINDER_STATE.index];
  const theme = getSubjectTheme(card.subject);
  const totalInDeck = REMINDER_STATE.deck.length;
  const pos = REMINDER_STATE.index + 1;
  const pct = Math.round((pos / totalInDeck) * 100);
  const promptText = card.quiz_prompt || `${card.title} — Kural neydi?`;
  const keyLine = card.example_text || card.rule_text || "";

  stage.innerHTML = `
    <div class="fc-top-hud">
      <div class="fc-progress-wrap">
        <div class="fc-progress-track">
          <div class="fc-progress-fill" style="width:${pct}%"></div>
        </div>
        <span class="fc-counter">${pos} / ${totalInDeck} Kart</span>
      </div>
      <span class="fc-streak-pill">🔥 Seri: ${REMINDER_STATE.streak}</span>
    </div>

    <div class="fc-scene">
      <div id="active-fc-card" class="fc-card ${REMINDER_STATE.flipped ? "is-flipped" : ""}"
           style="--card-accent:${theme.accent};--card-soft:${theme.soft};"
           onclick="flipCurrentFlashcard()">
        <!-- ÖN YÜZ: TUZAK SORU -->
        <div class="fc-face fc-front">
          <div class="fc-banner">
            <div class="fc-banner-left">${theme.emoji} ${escapeHtml(card.exam_type)} ${escapeHtml(card.subject)} • Bölüm ${card.batch_no || 1}</div>
            <span class="fc-banner-topic">${escapeHtml(card.topic)}</span>
          </div>
          <div class="fc-front-body">
            <span class="fc-front-badge">⚡ 3 Saniye Testi — Cevabı Aklından Söyle!</span>
            <div class="fc-prompt">${escapeHtml(promptText)}</div>
          </div>
          <div class="fc-tap-hint">👆 Cevabı ve görsel şemayı görmek için karta tıkla (veya Boşluk tuşuna bas)</div>
        </div>

        <!-- ARKA YÜZ: GÖRSEL ŞEMA + ❌ / ✅ -->
        <div class="fc-face fc-back">
          <div class="fc-banner">
            <div class="fc-banner-left">${theme.emoji} ${escapeHtml(card.subject)} • Doğru Cevap</div>
            <span class="fc-banner-topic">${escapeHtml(card.topic)}</span>
          </div>
          <div class="fc-back-body">
            <div class="fc-back-title">${escapeHtml(card.title)}</div>
            ${card.visual_svg ? `<div class="fc-svg-box">${card.visual_svg}</div>` : ""}
            ${
              card.wrong_trap || card.right_fact
                ? `<div class="fc-vs-grid">
                     <div class="fc-vs-box fc-vs-wrong"><span class="fc-vs-label">❌ TUZAK</span>${escapeHtml(card.wrong_trap)}</div>
                     <div class="fc-vs-box fc-vs-right"><span class="fc-vs-label">✅ DOĞRUSU</span>${escapeHtml(card.right_fact)}</div>
                   </div>`
                : `<div class="fc-vs-box fc-vs-right">${escapeHtml(card.rule_text)}</div>`
            }
            ${keyLine ? `<div class="fc-key-line">🔑 ${escapeHtml(keyLine)}</div>` : ""}
          </div>
        </div>
      </div>
    </div>

    <div class="fc-controls">
      <button class="btn btn-secondary" onclick="nextFlashcardLater()">🔁 Tekrar Sor</button>
      <button class="btn btn-ghost" onclick="flipCurrentFlashcard()">🔄 Kartı Çevir</button>
      <button class="btn btn-success" onclick="masterCurrentFlashcard()">✅ Bunu Biliyorum!</button>
    </div>

    <div class="fc-kbd-hint">
      Kısayollar: <kbd>Boşluk</kbd> Çevir • <kbd>←</kbd> Tekrar Sor • <kbd>→</kbd> Bunu Biliyorum
    </div>
  `;
  renderMath(stage);
}

function renderRemindersWall() {
  const grid = document.getElementById("reminders-grid");
  if (!grid) return;

  if (!REMINDER_STATE.items.length) {
    grid.innerHTML = `<div class="card"><p class="muted">Bu filtrede gösterilecek bilgi kartı yok.</p></div>`;
    return;
  }

  grid.innerHTML = REMINDER_STATE.items
    .map((r) => {
      const theme = getSubjectTheme(r.subject);
      const keyLine = r.example_text || r.rule_text || "";
      return `
      <div class="reminder-card ${r.mastered ? "is-mastered" : ""}" style="--card-accent:${theme.accent};--card-soft:${theme.soft};">
        <div class="rem-wall-head">
          <div class="topic-chips">
            <span class="chip" style="background:${theme.soft};color:${theme.accent};font-weight:800;">${theme.emoji} ${escapeHtml(r.subject)}</span>
            <span class="chip">${escapeHtml(r.topic)}</span>
          </div>
          <span class="chip">Bölüm ${r.batch_no || 1}</span>
        </div>
        <div class="reminder-title">${r.mastered ? "✅" : "⚡"} ${escapeHtml(r.title)}</div>
        ${r.visual_svg ? `<div class="rem-wall-svg">${r.visual_svg}</div>` : ""}
        ${
          r.wrong_trap || r.right_fact
            ? `<div class="fc-vs-grid">
                 <div class="fc-vs-box fc-vs-wrong" style="font-size:12px;padding:7px 9px;"><span class="fc-vs-label">❌ TUZAK</span>${escapeHtml(r.wrong_trap)}</div>
                 <div class="fc-vs-box fc-vs-right" style="font-size:12px;padding:7px 9px;"><span class="fc-vs-label">✅ DOĞRU</span>${escapeHtml(r.right_fact)}</div>
               </div>`
            : `<div style="font-size:13px;line-height:1.45;">${escapeHtml(r.rule_text)}</div>`
        }
        ${keyLine ? `<div class="fc-key-line" style="font-size:12px;padding:6px 9px;">🔑 ${escapeHtml(keyLine)}</div>` : ""}
        <div class="reminder-footer">
          <button class="btn btn-sm ${r.mastered ? "btn-secondary" : "btn-success"}" onclick="toggleReminderMastered(${r.id}, ${r.mastered ? "false" : "true"})">
            ${r.mastered ? "🔁 Tekrara Al" : "✓ Öğrendim"}
          </button>
          <button class="btn btn-sm btn-ghost text-rose" onclick="deleteReminder(${r.id})">Sil</button>
        </div>
      </div>`;
    })
    .join("");
  renderMath(grid);
}

// Klavye kısayolları (Bilgi Kartları sekmesindeyken aktif)
document.addEventListener("keydown", (e) => {
  const remTab = document.getElementById("tab-reminders");
  if (!remTab || !remTab.classList.contains("active")) return;
  if (REMINDER_STATE.mode !== "flashcard") return;
  const tag = (e.target?.tagName || "").toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return;
  if (!document.getElementById("reminder-modal")?.classList.contains("hidden")) return;

  if (e.code === "Space") {
    e.preventDefault();
    flipCurrentFlashcard();
  } else if (e.key === "ArrowLeft") {
    e.preventDefault();
    nextFlashcardLater();
  } else if (e.key === "ArrowRight") {
    e.preventDefault();
    masterCurrentFlashcard();
  }
});

async function toggleReminderMastered(id, mastered) {
  await apiFetch(`/api/reminders/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ mastered }),
  });
  showToast(mastered ? "Harika Asya! Kart öğrenildi olarak işaretlendi." : "Tekrar listesine alındı.");
  await loadReminders();
}

async function deleteReminder(id) {
  if (!confirm("Bu bilgi kartını silmek istediğine emin misin?")) return;
  await apiFetch(`/api/reminders/${id}`, { method: "DELETE" });
  showToast("Kart silindi.");
  await loadReminders();
}

function openReminderModal() {
  document.getElementById("reminder-modal").classList.remove("hidden");
}

function closeReminderModal() {
  document.getElementById("reminder-modal").classList.add("hidden");
  document.getElementById("reminder-form").reset();
}

async function submitReminder(e) {
  e.preventDefault();
  const payload = {
    exam_type: document.getElementById("r-exam-type").value,
    subject: document.getElementById("r-subject").value,
    topic: document.getElementById("r-topic").value,
    title: document.getElementById("r-title").value,
    quiz_prompt: document.getElementById("r-quiz-prompt").value,
    wrong_trap: document.getElementById("r-wrong-trap").value,
    right_fact: document.getElementById("r-right-fact").value,
    rule_text: document.getElementById("r-rule").value,
    example_text: document.getElementById("r-example").value,
  };
  await apiFetch("/api/reminders", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  showToast("Yeni görsel bilgi kartı eklendi!");
  closeReminderModal();
  await loadReminders();
}

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
