/**
 * Asya YKS Koçum — 100% Sunucusuz iPad / GitHub Pages Statik Motoru
 *
 * - İlk açılışta `window.ASYA_STATIC_DATA` (data.js) ile tüm soruları, föyleri ve
 *   3D Bilgi Kartlarını yükler.
 * - Asya'nın tüm ilerlemesi (doğru yapıp sildiği sorular, optik sonuçları,
 *   öğrendiği bilgi kartları, çalışma serisi, haftalık denemeler) cihazındaki
 *   `localStorage` içinde kalıcı saklanır.
 * - Yeni denemeler GitHub'a yüklendiğinde Asya'nın eski ilerlemesi ASLA silinmez;
 *   yeni sorular, yeni föyler ve yeni kartlar otomatik olarak üzerine eklenir.
 */
(function () {
  const STORAGE_KEY = "asya_yks_ipad_state_v1";
  const SAVED_PWD_KEY = "asya_yks_saved_pwd_v1";

  function b64ToBytes(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  async function decryptBundle(encObj, password) {
    const enc = new TextEncoder();
    const keyMat = await crypto.subtle.importKey(
      "raw",
      enc.encode(password),
      { name: "PBKDF2" },
      false,
      ["deriveKey"]
    );
    const aesKey = await crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: b64ToBytes(encObj.salt),
        iterations: encObj.iterations || 150000,
        hash: "SHA-256",
      },
      keyMat,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"]
    );
    const plainBuf = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: b64ToBytes(encObj.iv) },
      aesKey,
      b64ToBytes(encObj.ct)
    );
    return JSON.parse(new TextDecoder().decode(plainBuf));
  }

  window.asyaLockApp = function () {
    localStorage.removeItem(SAVED_PWD_KEY);
    location.reload();
  };

  window.asyaWaitForUnlock = async function () {
    if (window.ASYA_STATIC_DATA) return;

    const lockEl = document.getElementById("asya-lock-screen");
    const errEl = document.getElementById("lock-error");
    const inputEl = document.getElementById("lock-password");
    const rememberEl = document.getElementById("lock-remember");
    const formEl = document.getElementById("lock-form");
    const btnEl = document.getElementById("lock-submit-btn");
    const toggleBtn = document.getElementById("lock-toggle-pwd");

    if (toggleBtn && inputEl) {
      toggleBtn.addEventListener("click", () => {
        const show = inputEl.type === "password";
        inputEl.type = show ? "text" : "password";
        toggleBtn.textContent = show ? "🙈" : "👁️";
      });
    }

    if (!window.crypto || !window.crypto.subtle) {
      if (errEl) {
        errEl.textContent = "Tarayıcı güvenlik hatası: Lütfen linki https:// ile Safari'de açın.";
        errEl.classList.remove("hidden");
      }
      throw new Error("WebCrypto subtle unavailable");
    }

    // Veri paketini hemen arka planda indirmeye başla (submit listener'ı BLOKLAMADAN!)
    const dataPromise = fetch("data.enc.json?v=4", { cache: "no-store" })
      .then((resp) => {
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        return resp.json();
      });

    async function tryDecryptWithFallback(encObj, rawPwd) {
      const candidates = [rawPwd];
      const lower = rawPwd.toLowerCase();
      if (lower !== rawPwd) candidates.push(lower);
      let lastErr;
      for (const cand of candidates) {
        try {
          return { data: await decryptBundle(encObj, cand), usedPwd: cand };
        } catch (err) {
          lastErr = err;
        }
      }
      throw lastErr || new Error("Decrypt failed");
    }

    // ÖNCE submit listener'ı bağla — veri inerken bile tıklanınca sayfa ASLA yenilenmesin!
    return new Promise((resolve) => {
      let resolved = false;
      const finish = (data) => {
        if (resolved) return;
        resolved = true;
        window.ASYA_STATIC_DATA = data;
        if (lockEl) lockEl.classList.add("hidden");
        injectLockButton();
        resolve();
      };

      formEl.addEventListener("submit", async (e) => {
        e.preventDefault();
        const pwd = (inputEl.value || "").trim();
        if (!pwd) return;
        if (btnEl) {
          btnEl.disabled = true;
          btnEl.textContent = "🔓 Açılıyor...";
        }
        if (errEl) errEl.classList.add("hidden");
        try {
          const encObj = await dataPromise;
          const { data, usedPwd } = await tryDecryptWithFallback(encObj, pwd);
          if (!rememberEl || rememberEl.checked) {
            try {
              localStorage.setItem(SAVED_PWD_KEY, usedPwd);
            } catch {}
          }
          finish(data);
        } catch (err) {
          if (errEl) {
            const msg = String(err?.message || "");
            errEl.textContent = msg.startsWith("HTTP ")
              ? "⚠️ Veri paketi indirilemedi, interneti kontrol edip tekrar dene."
              : "❌ Şifre hatalı! Küçük harfle 'asya2026!' yazdığından emin ol.";
            errEl.classList.remove("hidden");
          }
          if (inputEl) {
            inputEl.focus();
            inputEl.select();
          }
        } finally {
          if (!resolved && btnEl) {
            btnEl.disabled = false;
            btnEl.textContent = "🔓 Giriş Yap";
          }
        }
      });

      // Kayıtlı şifre varsa veri indiğinde sessizce otomatik aç
      const saved = (() => {
        try {
          return localStorage.getItem(SAVED_PWD_KEY);
        } catch {
          return null;
        }
      })();
      if (saved) {
        if (btnEl) btnEl.textContent = "⏳ Otomatik açılıyor...";
        dataPromise
          .then((encObj) => tryDecryptWithFallback(encObj, saved))
          .then(({ data }) => finish(data))
          .catch(() => {
            try {
              localStorage.removeItem(SAVED_PWD_KEY);
            } catch {}
            if (!resolved && btnEl) btnEl.textContent = "🔓 Giriş Yap";
            if (lockEl) lockEl.classList.remove("hidden");
          });
      } else {
        if (lockEl) lockEl.classList.remove("hidden");
        if (inputEl) setTimeout(() => inputEl.focus(), 60);
      }
    });
  };

  function injectLockButton() {
    const footer = document.querySelector(".sidebar-footer");
    if (!footer || document.getElementById("asya-lock-btn")) return;
    const btn = document.createElement("button");
    btn.id = "asya-lock-btn";
    btn.className = "btn btn-ghost btn-sm";
    btn.style.cssText = "width:100%;margin-top:8px;justify-content:center;";
    btn.textContent = "🔒 Kilitle / Çıkış";
    btn.onclick = window.asyaLockApp;
    footer.appendChild(btn);
  }

  function escHtml(s) {
    return String(s || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function openHtmlInNewTab(html) {
    const w = window.open("", "_blank");
    if (w) {
      w.document.open();
      w.document.write(html);
      w.document.close();
    } else {
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      window.location.href = URL.createObjectURL(blob);
    }
  }

  window.openStaticMissionPrint = function (missionId) {
    const st = loadState();
    const m = getMergedMissions(st).find((x) => x.id === Number(missionId));
    if (!m) return;
    const seed = window.ASYA_STATIC_DATA || {};
    const blocks = (m.items || [])
      .map((it, idx) => {
        const imgSrc = it.image_filename && seed.images?.[it.image_filename] ? seed.images[it.image_filename] : "";
        const imgHtml = imgSrc ? `<div class="q-media"><img src="${imgSrc}" alt="Soru ${idx + 1}" /></div>` : "";
        const svgHtml = !imgSrc && it.svg_markup ? `<div class="q-media">${it.svg_markup}</div>` : "";
        const txtHtml = it.question_text ? `<div class="q-text">${escHtml(it.question_text).replaceAll("\n", "<br/>")}</div>` : "";
        const opts = it.options || {};
        const optHtml = ["A", "B", "C", "D", "E"]
          .filter((k) => opts[k])
          .map((k) => `<div class="opt"><strong>${k})</strong> ${escHtml(opts[k])}</div>`)
          .join("");
        return `<div class="q-block">
          <div class="q-head"><span>SORU ${idx + 1}</span><span class="q-meta">${escHtml(it.exam_type)} ${escHtml(it.subject)} • ${escHtml(it.topic)}</span></div>
          ${imgHtml}${svgHtml}${txtHtml}
          ${optHtml ? `<div class="opts">${optHtml}</div>` : ""}
        </div>`;
      })
      .join("");

    const optRows = (m.items || [])
      .map((_, i) => `<div class="orow"><span>${i + 1}.</span>${["A", "B", "C", "D", "E"].map((l) => `<i>${l}</i>`).join("")}</div>`)
      .join("");

    const html = `<!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8"/><title>${escHtml(m.title)}</title>
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css"/>
      <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js"><\/script>
      <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/contrib/auto-render.min.js"
        onload="renderMathInElement(document.body,{delimiters:[{left:'$$',right:'$$',display:true},{left:'$',right:'$',display:false}],throwOnError:false});"><\/script>
      <style>
        @page{size:A4;margin:10mm;} *{box-sizing:border-box;}
        body{font-family:'Segoe UI',Arial,sans-serif;color:#111827;margin:0;padding:16px;background:#fff;}
        .noprint{display:flex;justify-content:flex-end;gap:10px;margin-bottom:14px;}
        .noprint button{padding:10px 18px;border-radius:10px;border:none;background:#4f46e5;color:#fff;font-weight:800;font-size:14px;cursor:pointer;}
        .hdr{border:2px solid #1e1b4b;border-radius:10px;padding:10px 14px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:center;}
        .hdr h1{font-size:15px;margin:0 0 3px 0;} .hdr p{font-size:11px;margin:0;color:#475569;}
        .cols{column-count:2;column-gap:18px;column-rule:1px solid #cbd5e1;}
        .q-block{break-inside:avoid;margin-bottom:14px;padding-bottom:10px;border-bottom:1px dashed #e2e8f0;}
        .q-head{display:flex;justify-content:space-between;font-weight:800;font-size:11.5px;color:#4338ca;margin-bottom:6px;}
        .q-meta{font-weight:600;color:#64748b;font-size:9.5px;}
        .q-media{text-align:center;margin:6px 0;} .q-media img,.q-media svg{max-width:100%;max-height:200px;height:auto;}
        .q-text{font-size:11px;line-height:1.48;margin-bottom:6px;}
        .opts{font-size:10.8px;line-height:1.45;} .opt{margin-bottom:2px;}
        .obox{margin-top:16px;border:1.5px solid #1e293b;border-radius:10px;padding:10px 14px;break-inside:avoid;}
        .ogrid{display:grid;grid-template-columns:repeat(2,1fr);gap:6px 24px;margin-top:8px;}
        .orow{display:flex;align-items:center;gap:6px;font-size:11px;font-weight:700;}
        .orow span{width:22px;} .orow i{font-style:normal;width:20px;height:20px;border:1.2px solid #334155;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:10px;}
        @media print{.noprint{display:none;} body{padding:0;}}
      </style></head><body>
      <div class="noprint"><button onclick="window.print()">🖨️ Yazdır / PDF Kaydet</button></div>
      <div class="hdr"><div><h1>ASYA YKS KOÇUM — GÜNLÜK KONU FÖYÜ</h1><p>${escHtml(m.title)}</p></div><div style="font-size:11px;font-weight:700;">${escHtml(m.mission_date)}</div></div>
      <div class="cols">${blocks}</div>
      <div class="obox"><strong style="font-size:11.5px;">OPTİK KODLAMA KUTUSU (Kâğıtta işaretle, sonra uygulamaya gir)</strong><div class="ogrid">${optRows}</div></div>
      </body></html>`;
    openHtmlInNewTab(html);
  };

  window.openStaticReminderPrint = function (mode, batchNo) {
    const st = loadState();
    let cards = getMergedReminders(st);
    let badge = "📚 TAM ARŞİV POSTERİ";
    let sub = "Tüm bölümlerin ders ders görsel bilgi kartları posteri!";
    if (batchNo) {
      cards = cards.filter((c) => (c.batch_no || 1) === Number(batchNo));
      badge = `BÖLÜM ${batchNo} FASİKÜLÜ`;
      sub = `Sadece Bölüm ${batchNo} kartları • Eski bastıklarını tekrar basmadan dosyanın arkasına ekle!`;
    } else if (mode === "final") {
      cards = cards.filter((c) => !c.mastered);
      badge = "🏆 FİNAL SÜRÜMÜ";
      sub = "Öğrendiklerin otomatik elendi • Sadece hâlâ tekrar gereken altın tuzak kartları!";
    }
    cards.sort((a, b) => a.subject.localeCompare(b.subject, "tr") || a.id - b.id);

    const themes = {
      Kimya: ["#7c3aed", "#f5f3ff", "#6d28d9", "🧪"],
      Fizik: ["#2563eb", "#eff6ff", "#1d4ed8", "⚡"],
      Biyoloji: ["#059669", "#ecfdf5", "#047857", "🧬"],
      Türkçe: ["#ea580c", "#fff7ed", "#c2410c", "✍️"],
      Matematik: ["#0891b2", "#ecfeff", "#0e7490", "➗"],
      Geometri: ["#4f46e5", "#eef2ff", "#4338ca", "📐"],
      Tarih: ["#b91c1c", "#fef2f2", "#991b1b", "🏛️"],
      Coğrafya: ["#d97706", "#fffbeb", "#b45309", "🌍"],
    };

    const grouped = new Map();
    for (const c of cards) {
      const k = `${c.exam_type} • ${c.subject}`;
      if (!grouped.has(k)) grouped.set(k, []);
      grouped.get(k).push(c);
    }

    const sections = Array.from(grouped.entries())
      .map(([gName, list]) => {
        const [accent, soft, hbg, emoji] = themes[list[0].subject] || ["#4f46e5", "#eef2ff", "#3730a3", "📌"];
        const itemsHtml = list
          .map((c) => {
            const svgHtml = c.visual_svg ? `<div class="rsvg">${c.visual_svg}</div>` : "";
            const vsHtml =
              c.wrong_trap || c.right_fact
                ? `<div class="vs"><div class="vw"><span>❌ TUZAK</span>${escHtml(c.wrong_trap)}</div><div class="vr"><span>✅ DOĞRU</span>${escHtml(c.right_fact)}</div></div>`
                : `<div class="vr">${escHtml(c.rule_text)}</div>`;
            const key = c.example_text || c.rule_text || "";
            return `<div class="rc" style="--ac:${accent};--sf:${soft};">
              <div class="rh"><strong>${escHtml(c.title)}</strong><span class="rb">B${c.batch_no || 1}</span></div>
              <div class="rt">${escHtml(c.topic)}</div>
              ${svgHtml}${vsHtml}
              ${key ? `<div class="rk">🔑 ${escHtml(key)}</div>` : ""}
            </div>`;
          })
          .join("");
        return `<section><h2 style="background:${hbg};">${emoji} ${escHtml(gName)} <span>${list.length} kart</span></h2><div class="grid">${itemsHtml}</div></section>`;
      })
      .join("");

    const html = `<!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8"/><title>Asya YKS — Görsel Bilgi Kartları Posteri</title>
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css"/>
      <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js"><\/script>
      <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/contrib/auto-render.min.js"
        onload="renderMathInElement(document.body,{delimiters:[{left:'$$',right:'$$',display:true},{left:'$',right:'$',display:false}],throwOnError:false});"><\/script>
      <style>
        @page{size:A4;margin:8mm;} *{box-sizing:border-box;}
        body{font-family:'Segoe UI',Arial,sans-serif;color:#0f172a;margin:0;padding:12px;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
        .noprint{display:flex;justify-content:flex-end;margin-bottom:10px;}
        .noprint button{padding:10px 18px;border-radius:10px;border:none;background:#4f46e5;color:#fff;font-weight:800;font-size:14px;cursor:pointer;}
        .ban{background:linear-gradient(135deg,#1e1b4b,#4f46e5);color:#fff;border-radius:12px;padding:11px 16px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;}
        .ban h1{font-size:15px;margin:0 0 2px;} .ban p{font-size:10.5px;margin:0;color:#e0e7ff;}
        .bb{background:#fef08a;color:#1e1b4b;font-size:10.5px;font-weight:900;padding:5px 11px;border-radius:999px;white-space:nowrap;}
        section{margin-bottom:10px;} h2{font-size:12px;color:#fff;padding:5px 11px;border-radius:8px;margin:0 0 7px;display:flex;justify-content:space-between;break-after:avoid;}
        h2 span{font-size:10px;background:rgba(255,255,255,.22);padding:1px 7px;border-radius:999px;}
        .grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;}
        .rc{break-inside:avoid;border:1.4px solid #cbd5e1;border-top:4px solid var(--ac);border-radius:10px;padding:7px 9px;display:flex;flex-direction:column;gap:5px;}
        .rh{display:flex;justify-content:space-between;gap:6px;font-size:11px;}
        .rb{font-size:8.5px;font-weight:800;color:var(--ac);background:var(--sf);padding:1px 5px;border-radius:5px;flex-shrink:0;}
        .rt{font-size:8.8px;color:#64748b;font-weight:600;margin-top:-3px;}
        .rsvg{background:var(--sf);border-radius:7px;padding:4px 6px;display:flex;justify-content:center;}
        .rsvg svg{max-width:100%;max-height:68px;width:auto;height:auto;}
        .vs{display:grid;grid-template-columns:1fr 1fr;gap:5px;}
        .vw,.vr{border-radius:7px;padding:4px 6px;font-size:9.3px;font-weight:600;line-height:1.3;}
        .vw{background:#fff1f2;border:1px solid #fecdd3;color:#881337;}
        .vr{background:#ecfdf5;border:1px solid #a7f3d0;color:#064e3b;}
        .vw span,.vr span{display:block;font-size:8px;font-weight:900;margin-bottom:1px;}
        .rk{background:#fefce8;border:1px dashed #eab308;border-radius:6px;padding:4px 7px;font-size:9.2px;font-weight:700;color:#713f12;}
        @media print{.noprint{display:none;} body{padding:0;}}
      </style></head><body>
      <div class="noprint"><button onclick="window.print()">🖨️ Yazdır / PDF Kaydet</button></div>
      <div class="ban"><div><h1>⚡ ASYA YKS — GÖRSEL BİLGİ KARTLARI POSTERİ</h1><p>${escHtml(sub)}</p></div><div class="bb">${escHtml(badge)} • ${cards.length} KART</div></div>
      ${sections || '<p style="text-align:center;padding:40px;">🎉 Harika! Tüm kartları öğrenmişsin!</p>'}
      </body></html>`;
    openHtmlInNewTab(html);
  };

  function todayIso() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function nowStr() {
    const d = new Date();
    return `${todayIso()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }

  function loadState() {
    const base = {
      clearedQuestionIds: [],
      deletedQuestionIds: [],
      customQuestions: [],
      topicClearedExtra: {},
      repeatWrongCounts: {},
      missionGrades: {},
      deletedMissionIds: [],
      customMissions: [],
      masteredMap: {},
      printedBatchMap: {},
      deletedReminderIds: [],
      customReminders: [],
      mockExams: [],
      activityDays: [],
      nextCustomId: 100000,
    };
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return base;
      const parsed = JSON.parse(raw);
      return { ...base, ...parsed };
    } catch {
      return base;
    }
  }

  function saveState(st) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(st));
    } catch (e) {
      console.warn("localStorage save warning:", e);
    }
  }

  function recordActivityDay(st) {
    const t = todayIso();
    if (!st.activityDays.includes(t)) {
      st.activityDays.push(t);
    }
  }

  function calcStreak(days) {
    if (!days || !days.length) return 0;
    const set = new Set(days);
    let streak = 0;
    const cur = new Date();
    for (let i = 0; i < 365; i++) {
      const iso = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(cur.getDate()).padStart(2, "0")}`;
      if (set.has(iso)) {
        streak += 1;
        cur.setDate(cur.getDate() - 1);
      } else if (i === 0) {
        cur.setDate(cur.getDate() - 1);
      } else {
        break;
      }
    }
    return streak;
  }

  function getActiveQuestions(st) {
    const seed = window.ASYA_STATIC_DATA || {};
    const cleared = new Set(st.clearedQuestionIds || []);
    const deleted = new Set(st.deletedQuestionIds || []);
    const all = [...(seed.questions || []), ...(st.customQuestions || [])];
    return all
      .filter((q) => !cleared.has(q.id) && !deleted.has(q.id))
      .map((q) => ({
        ...q,
        times_wrong: (q.times_wrong || 0) + (st.repeatWrongCounts[q.id] || 0),
        times_reviewed: (q.times_reviewed || 0) + (st.repeatWrongCounts[q.id] || 0),
      }));
  }

  function getTopicWeight(seed, examType, subject, topic) {
    const w = seed.topic_weights?.[examType]?.[subject]?.[topic];
    if (typeof w === "number") return w;
    const quota = seed.subject_quotas?.[examType]?.[subject] || 5;
    const tList = seed.topics?.[examType]?.[subject] || [];
    return Math.max(0.5, Math.round((quota / Math.max(1, tList.length)) * 100) / 100);
  }

  function getExamCounts(seed) {
    return seed.exam_counts || { TYT: 3, AYT: 0 };
  }

  function computeTopicScores(st) {
    const seed = window.ASYA_STATIC_DATA || {};
    const examCounts = getExamCounts(seed);
    const activeQs = getActiveQuestions(st);
    const byKey = new Map();

    for (const q of activeQs) {
      const k = `${q.exam_type}||${q.subject}||${q.topic}`;
      if (!byKey.has(k)) {
        byKey.set(k, { active: 0, wrong: 0, blank: 0, repeatWrong: 0 });
      }
      const agg = byKey.get(k);
      agg.active += 1;
      if (q.mistake_type === "yanlis") agg.wrong += 1;
      else agg.blank += 1;
      agg.repeatWrong += q.times_wrong || 0;
    }

    const clearedMap = new Map();
    for (const h of seed.topic_history || []) {
      clearedMap.set(`${h.exam_type}||${h.subject}||${h.topic}`, h.cleared_count || 0);
    }
    for (const [k, extra] of Object.entries(st.topicClearedExtra || {})) {
      clearedMap.set(k, (clearedMap.get(k) || 0) + extra);
    }

    const keys = new Set([...byKey.keys(), ...clearedMap.keys()]);
    const rows = [];
    for (const k of keys) {
      const [exam_type, subject, topic] = k.split("||");
      const agg = byKey.get(k) || { active: 0, wrong: 0, blank: 0, repeatWrong: 0 };
      const cleared = clearedMap.get(k) || 0;

      const nExams = Math.max(1, examCounts[exam_type] || 0);
      const weight = getTopicWeight(seed, exam_type, subject, topic);
      const expectedQ = Math.round(Math.max(1.0, nExams * weight) * 10) / 10;
      const activeErrors = agg.wrong + agg.blank;
      const denom = Math.max(expectedQ, activeErrors, 1.0);
      const rawPct = 100.0 * Math.max(0.0, (expectedQ - activeErrors) / denom);
      const score = Math.max(0, Math.min(100, Math.round(rawPct - agg.repeatWrong * 3)));
      const estCorrect = Math.max(0, Math.round(expectedQ - activeErrors));

      let level = "Güçlü";
      if (agg.active === 0 && cleared > 0) level = "Temizlendi ✓";
      else if (score < 50) level = "Kritik";
      else if (score < 80) level = "Gelişiyor";

      rows.push({
        exam_type,
        subject,
        topic,
        exam_count: nExams,
        expected_questions: expectedQ,
        estimated_correct: estCorrect,
        active_questions: agg.active,
        unsolved_wrong: agg.wrong,
        unsolved_blank: agg.blank,
        cleared_count: cleared,
        score,
        level,
      });
    }
    rows.sort((a, b) => a.score - b.score || b.active_questions - a.active_questions);
    return rows;
  }

  function getMergedMissions(st) {
    const seed = window.ASYA_STATIC_DATA || {};
    const deleted = new Set(st.deletedMissionIds || []);
    const all = [...(seed.missions || []), ...(st.customMissions || [])].filter((m) => !deleted.has(m.id));
    return all
      .map((m) => {
        const grade = st.missionGrades[m.id];
        const pdfHref = m.pdf_filename ? `pdfs/${encodeURIComponent(m.pdf_filename)}` : "#";
        const items = (m.items || []).map((it) => {
          const itemGrade = grade?.items?.[it.id];
          const isGraded = Boolean(grade) || m.status === "graded";
          return {
            ...it,
            has_answer_key: Boolean(it.correct_answer),
            user_answer: itemGrade ? itemGrade.user_answer : it.user_answer || "",
            result: itemGrade ? itemGrade.result : it.result || "pending",
            deleted_from_db: itemGrade ? itemGrade.deleted_from_db : it.deleted_from_db || 0,
            correct_answer: isGraded ? it.correct_answer : "",
            solution: isGraded ? it.solution : "",
          };
        });
        return {
          ...m,
          status: grade ? "graded" : m.status,
          correct_count: grade ? grade.correct_count : m.correct_count || 0,
          wrong_count: grade ? grade.wrong_count : m.wrong_count || 0,
          blank_count: grade ? grade.blank_count : m.blank_count || 0,
          deleted_count: grade ? grade.deleted_count : m.deleted_count || 0,
          net_score: grade ? grade.net_score : m.net_score || 0,
          pdf_url: pdfHref,
          print_url: pdfHref,
          items,
        };
      })
      .sort((a, b) => b.id - a.id);
  }

  function getMergedReminders(st) {
    const seed = window.ASYA_STATIC_DATA || {};
    const deleted = new Set(st.deletedReminderIds || []);
    const all = [...(seed.reminders || []), ...(st.customReminders || [])].filter((r) => !deleted.has(r.id));
    return all.map((r) => {
      const mastered = r.id in st.masteredMap ? (st.masteredMap[r.id] ? 1 : 0) : r.mastered || 0;
      const batchNo = r.batch_no || 1;
      const printed = batchNo in st.printedBatchMap ? (st.printedBatchMap[batchNo] ? 1 : 0) : r.printed || 0;
      return { ...r, batch_no: batchNo, mastered, printed };
    });
  }

  function buildBatches(reminders) {
    const map = new Map();
    for (const r of reminders) {
      const b = r.batch_no || 1;
      if (!map.has(b)) map.set(b, { batch_no: b, total: 0, mastered_count: 0, unprinted_count: 0 });
      const obj = map.get(b);
      obj.total += 1;
      if (r.mastered) obj.mastered_count += 1;
      if (!r.printed) obj.unprinted_count += 1;
    }
    return Array.from(map.values())
      .sort((a, b) => a.batch_no - b.batch_no)
      .map((b) => ({ ...b, is_printed: b.unprinted_count === 0 }));
  }

  function parseUrl(rawUrl) {
    const [path, qs] = rawUrl.split("?");
    const params = new URLSearchParams(qs || "");
    return { path, params };
  }

  function makeMissionFromPool(st, pool, examType, subject, topic, title) {
    const id = st.nextCustomId++;
    const items = pool.map((q, idx) => ({
      id: st.nextCustomId++,
      mission_id: id,
      question_id: q.id,
      order_index: idx + 1,
      exam_type: q.exam_type,
      subject: q.subject,
      topic: q.topic,
      mistake_type: q.mistake_type,
      question_text: q.question_text,
      options: q.options || {},
      svg_markup: q.svg_markup || "",
      image_filename: q.image_filename || "",
      correct_answer: q.correct_answer || "",
      solution: q.solution || "",
      exam_name: q.exam_name || "",
      user_answer: "",
      result: "pending",
      deleted_from_db: 0,
    }));
    const m = {
      id,
      mission_date: todayIso(),
      exam_type: examType,
      subject,
      topic,
      title,
      target_count: items.length,
      pdf_filename: "",
      status: "open",
      correct_count: 0,
      wrong_count: 0,
      blank_count: 0,
      deleted_count: 0,
      net_score: 0,
      items,
    };
    st.customMissions.push(m);
    saveState(st);
    return getMergedMissions(st).find((x) => x.id === id);
  }

  window.staticApiFetch = async function (rawUrl, options = {}) {
    const method = (options.method || "GET").toUpperCase();
    const body = options.body ? JSON.parse(options.body) : {};
    const { path, params } = parseUrl(rawUrl);
    const seed = window.ASYA_STATIC_DATA || {};
    const st = loadState();

    // 1. Topics
    if (path === "/api/topics" && method === "GET") {
      return { topics: seed.topics || {} };
    }

    // 2. Dashboard
    if (path === "/api/dashboard" && method === "GET") {
      const examCounts = getExamCounts(seed);
      const activeQs = getActiveQuestions(st);
      const scores = computeTopicScores(st);
      const missions = getMergedMissions(st);
      const tytTotal = activeQs.filter((q) => q.exam_type === "TYT").length;
      const aytTotal = activeQs.filter((q) => q.exam_type === "AYT").length;
      const clearedFromSeed = (seed.topic_history || []).reduce((acc, h) => acc + (h.cleared_count || 0), 0);
      const clearedExtra = Object.values(st.topicClearedExtra || {}).reduce((acc, v) => acc + v, 0);
      const totalExpectedAll = (examCounts.TYT || 0) * 120 + (examCounts.AYT || 0) * 80;
      const avgScore = totalExpectedAll > 0
        ? Math.round(1000 * Math.max(0, (totalExpectedAll - activeQs.length) / totalExpectedAll)) / 10
        : scores.length
        ? Math.round((scores.reduce((a, b) => a + b.score, 0) / scores.length) * 10) / 10
        : 100;
      const openMissions = missions.filter((m) => m.status === "open").length;
      const completedMocks = (st.mockExams || []).filter((e) => e.exam.status === "completed").length;

      return {
        stats: {
          active_total: activeQs.length,
          tyt_total: tytTotal,
          ayt_total: aytTotal,
          cleared_total: clearedFromSeed + clearedExtra,
          average_topic_score: avgScore,
          exam_counts: examCounts,
          total_expected_questions: totalExpectedAll,
          weekly_exam_ready: activeQs.length >= 10,
          completed_mock_exams: completedMocks,
          streak_days: calcStreak(st.activityDays),
          open_missions: openMissions,
        },
        today_missions: missions.slice(0, 6),
        weakest_topics: scores.filter((t) => t.active_questions > 0).slice(0, 8),
      };
    }

    // 3. Scores
    if (path === "/api/scores" && method === "GET") {
      const examCounts = getExamCounts(seed);
      const examFilter = params.get("exam_type") || "ALL";
      const subjFilter = params.get("subject") || "ALL";
      const includeAll = params.get("include_all") === "true";
      const baseScores = computeTopicScores(st);
      const scoreMap = new Map(baseScores.map((r) => [`${r.exam_type}||${r.subject}||${r.topic}`, r]));

      let list = [];
      if (includeAll) {
        for (const [et, subjMap] of Object.entries(seed.topics || {})) {
          if (examFilter !== "ALL" && et !== examFilter) continue;
          const nEx = examCounts[et] || 0;
          for (const [subj, topics] of Object.entries(subjMap)) {
            if (subjFilter !== "ALL" && subj !== subjFilter) continue;
            for (const top of topics) {
              const found = scoreMap.get(`${et}||${subj}||${top}`);
              const expQ = nEx > 0 ? Math.round(nEx * getTopicWeight(seed, et, subj, top) * 10) / 10 : 0;
              list.push(
                found || {
                  exam_type: et,
                  subject: subj,
                  topic: top,
                  exam_count: nEx,
                  expected_questions: expQ,
                  estimated_correct: Math.round(expQ),
                  active_questions: 0,
                  unsolved_wrong: 0,
                  unsolved_blank: 0,
                  cleared_count: 0,
                  score: 100,
                  level: nEx > 0 ? "Temiz" : "Deneme Yok",
                }
              );
            }
          }
        }
        list.sort((a, b) => a.score - b.score || b.active_questions - a.active_questions);
      } else {
        list = baseScores.filter(
          (r) =>
            (examFilter === "ALL" || r.exam_type === examFilter) &&
            (subjFilter === "ALL" || r.subject === subjFilter)
        );
      }

      const subjAgg = new Map();
      for (const r of list) {
        const k = `${r.exam_type}||${r.subject}`;
        if (!subjAgg.has(k)) subjAgg.set(k, { exam_type: r.exam_type, subject: r.subject, topics: 0, active: 0, cleared: 0 });
        const o = subjAgg.get(k);
        o.topics += 1;
        o.active += r.active_questions || 0;
        o.cleared += r.cleared_count || 0;
      }
      const subject_summary = Array.from(subjAgg.values())
        .map((o) => {
          const nEx = examCounts[o.exam_type] || 0;
          const quota = seed.subject_quotas?.[o.exam_type]?.[o.subject] || 10;
          const expTotal = nEx * quota;
          const avgS = expTotal > 0 ? Math.round(1000 * Math.max(0, (expTotal - o.active) / expTotal)) / 10 : 100.0;
          const estC = expTotal > 0 ? Math.max(0, expTotal - o.active) : 0;
          return {
            exam_type: o.exam_type,
            subject: o.subject,
            topic_count: o.topics,
            exam_count: nEx,
            expected_questions: expTotal,
            active_mistakes: o.active,
            estimated_correct: estC,
            cleared_count: o.cleared,
            average_score: avgS,
          };
        })
        .sort((a, b) => (a.exam_count > 0 ? 0 : 1) - (b.exam_count > 0 ? 0 : 1) || a.average_score - b.average_score || b.active_mistakes - a.active_mistakes);
      return { topic_scores: list, subject_summary, exam_counts: examCounts };
    }

    // 4. Questions
    if (path === "/api/questions" && method === "GET") {
      const et = params.get("exam_type") || "ALL";
      const subj = params.get("subject") || "ALL";
      const mt = params.get("mistake_type") || "ALL";
      const search = (params.get("search") || "").trim().toLowerCase();
      let qs = getActiveQuestions(st);
      qs = qs.filter((q) => {
        if (et !== "ALL" && q.exam_type !== et) return false;
        if (subj !== "ALL" && q.subject !== subj) return false;
        if (mt !== "ALL" && q.mistake_type !== mt) return false;
        if (search) {
          const hay = `${q.subject} ${q.topic} ${q.question_text} ${q.exam_name}`.toLowerCase();
          if (!hay.includes(search)) return false;
        }
        return true;
      });
      qs.sort((a, b) => b.id - a.id);
      return { questions: qs };
    }

    if (path === "/api/questions" && method === "POST") {
      const q = {
        id: st.nextCustomId++,
        exam_type: body.exam_type || "TYT",
        subject: body.subject || "",
        topic: body.topic || "",
        mistake_type: body.mistake_type || "yanlis",
        question_text: body.question_text || "",
        options: body.options || {},
        svg_markup: body.svg_markup || "",
        image_filename: "",
        correct_answer: (body.correct_answer || "").toUpperCase(),
        solution: body.solution || "",
        exam_name: body.exam_name || "iPad Ekleme",
        times_reviewed: 0,
        times_wrong: 0,
      };
      st.customQuestions.push(q);
      saveState(st);
      return { question: q };
    }

    const qDelMatch = path.match(/^\/api\/questions\/(\d+)$/);
    if (qDelMatch && method === "DELETE") {
      const id = Number(qDelMatch[1]);
      if (!st.deletedQuestionIds.includes(id)) st.deletedQuestionIds.push(id);
      saveState(st);
      return { deleted: true, id };
    }

    // 5. Daily Missions
    if (path === "/api/daily-missions/topics-ready" && method === "GET") {
      const et = params.get("exam_type") || "ALL";
      const scores = computeTopicScores(st).filter(
        (t) => t.active_questions > 0 && (et === "ALL" || t.exam_type === et)
      );
      return {
        topics: scores.map((t) => ({ ...t, ready_for_10: t.active_questions >= 10 })),
      };
    }

    if (path === "/api/daily-missions" && method === "GET") {
      return { missions: getMergedMissions(st) };
    }

    if (path === "/api/daily-missions" && method === "POST") {
      const mode = body.mode || "mixed";
      const et = body.exam_type || "ALL";
      const target = Number(body.target_count || 10);
      let pool = getActiveQuestions(st).filter((q) => et === "ALL" || q.exam_type === et);
      if (mode === "topic") {
        pool = pool.filter((q) => q.subject === body.subject && q.topic === body.topic).slice(0, target);
        if (!pool.length) throw new Error("Bu konuda aktif soru kalmadı.");
        const m = makeMissionFromPool(st, pool, et, body.subject, body.topic, `${body.subject} — ${body.topic} (${pool.length} Soru)`);
        return { mission: m };
      }
      if (mode === "split_all") {
        const openAssigned = new Set();
        for (const m of getMergedMissions(st)) {
          if (m.status === "open") {
            for (const it of m.items) if (it.question_id) openAssigned.add(it.question_id);
          }
        }
        const free = pool.filter((q) => !openAssigned.has(q.id));
        if (!free.length) throw new Error("Tüm aktif sorular zaten açık föylere dağıtılmış.");
        const created = [];
        for (let i = 0; i < free.length; i += target) {
          const chunk = free.slice(i, i + target);
          const subjs = [...new Set(chunk.map((q) => q.subject))].slice(0, 3).join(", ");
          created.push(makeMissionFromPool(st, chunk, et, "Karma", subjs, `Günlük Karma Föy (${chunk.length} Soru • ${subjs})`));
        }
        return { missions: created };
      }
      const selected = mode === "all" ? pool : pool.slice(0, target);
      if (!selected.length) throw new Error("Aktif havuzda soru kalmadı — tebrikler!");
      const subjs = [...new Set(selected.map((q) => q.subject))].slice(0, 3).join(", ");
      const m = makeMissionFromPool(st, selected, et, "Karma", subjs, `Günlük Karma Föy (${selected.length} Soru • ${subjs})`);
      return { mission: m };
    }

    const mDetailMatch = path.match(/^\/api\/daily-missions\/(\d+)$/);
    if (mDetailMatch && method === "GET") {
      const id = Number(mDetailMatch[1]);
      const m = getMergedMissions(st).find((x) => x.id === id);
      if (!m) throw new Error("Görev bulunamadı.");
      return { mission: m };
    }
    if (mDetailMatch && method === "DELETE") {
      const id = Number(mDetailMatch[1]);
      if (!st.deletedMissionIds.includes(id)) st.deletedMissionIds.push(id);
      saveState(st);
      return { deleted: true, id };
    }

    const mGradeMatch = path.match(/^\/api\/daily-missions\/(\d+)\/grade$/);
    if (mGradeMatch && method === "POST") {
      const id = Number(mGradeMatch[1]);
      const rawMission = [...(seed.missions || []), ...(st.customMissions || [])].find((x) => x.id === id);
      if (!rawMission) throw new Error("Görev bulunamadı.");

      const ansMap = new Map((body.answers || []).map((a) => [Number(a.item_id), a]));
      let correct = 0;
      let wrong = 0;
      let blank = 0;
      let deletedCount = 0;
      const gradedItems = {};

      for (const it of rawMission.items || []) {
        const a = ansMap.get(it.id) || {};
        const uAns = (a.user_answer || "").trim().toUpperCase();
        const key = (it.correct_answer || "").trim().toUpperCase();
        let res = "blank";
        if (key) {
          if (!uAns) res = "blank";
          else if (uAns === key) res = "correct";
          else res = "wrong";
        } else if (a.self_result) {
          res = a.self_result;
        }

        let deletedFromDb = 0;
        if (res === "correct") {
          correct += 1;
          if (it.question_id && !st.clearedQuestionIds.includes(it.question_id)) {
            st.clearedQuestionIds.push(it.question_id);
            deletedCount += 1;
            deletedFromDb = 1;
            const tk = `${it.exam_type}||${it.subject}||${it.topic}`;
            st.topicClearedExtra[tk] = (st.topicClearedExtra[tk] || 0) + 1;
          }
        } else if (res === "wrong") {
          wrong += 1;
          if (it.question_id) {
            st.repeatWrongCounts[it.question_id] = (st.repeatWrongCounts[it.question_id] || 0) + 1;
          }
        } else {
          blank += 1;
        }
        gradedItems[it.id] = { user_answer: uAns, result: res, deleted_from_db: deletedFromDb };
      }

      const net = Math.round((correct - wrong * 0.25) * 100) / 100;
      st.missionGrades[id] = {
        correct_count: correct,
        wrong_count: wrong,
        blank_count: blank,
        deleted_count: deletedCount,
        net_score: net,
        items: gradedItems,
      };
      recordActivityDay(st);
      saveState(st);
      return { mission: getMergedMissions(st).find((x) => x.id === id) };
    }

    // 6. Reminders / 3D Bilgi Kartları
    if (path === "/api/reminders" && method === "GET") {
      const et = params.get("exam_type") || "ALL";
      const subj = params.get("subject") || "ALL";
      const onlyUnm = params.get("only_unmastered") === "true";
      const bNo = params.get("batch_no") ? Number(params.get("batch_no")) : null;
      const all = getMergedReminders(st);
      const filtered = all.filter((r) => {
        if (et !== "ALL" && r.exam_type !== et) return false;
        if (subj !== "ALL" && r.subject !== subj) return false;
        if (onlyUnm && r.mastered) return false;
        if (bNo && (r.batch_no || 1) !== bNo) return false;
        return true;
      });
      filtered.sort((a, b) => a.mastered - b.mastered || (b.batch_no || 1) - (a.batch_no || 1) || b.id - a.id);
      const unmasteredCount = all.filter((r) => !r.mastered).length;
      const unprintedCount = all.filter((r) => !r.printed).length;
      return {
        reminders: filtered,
        total_count: all.length,
        unmastered_count: unmasteredCount,
        mastered_count: all.length - unmasteredCount,
        unprinted_count: unprintedCount,
        batches: buildBatches(all),
      };
    }

    if (path === "/api/reminders" && method === "POST") {
      const all = getMergedReminders(st);
      const maxB = all.reduce((m, r) => Math.max(m, r.batch_no || 1), 1);
      const item = {
        id: st.nextCustomId++,
        exam_type: body.exam_type || "TYT",
        subject: body.subject || "",
        topic: body.topic || "",
        title: body.title || "",
        rule_text: body.rule_text || "",
        example_text: body.example_text || "",
        quiz_prompt: body.quiz_prompt || "",
        wrong_trap: body.wrong_trap || "",
        right_fact: body.right_fact || "",
        visual_svg: body.visual_svg || "",
        batch_no: body.batch_no || maxB,
        printed: 0,
        mastered: 0,
      };
      st.customReminders.push(item);
      saveState(st);
      return { reminder: item };
    }

    const remBatchPrintMatch = path.match(/^\/api\/reminders\/batches\/(\d+)\/mark-printed$/);
    if (remBatchPrintMatch && method === "POST") {
      const bNo = Number(remBatchPrintMatch[1]);
      const printed = params.get("printed") !== "false";
      st.printedBatchMap[bNo] = printed;
      saveState(st);
      return { batch_no: bNo, printed, batches: buildBatches(getMergedReminders(st)) };
    }

    const remMatch = path.match(/^\/api\/reminders\/(\d+)$/);
    if (remMatch && method === "PATCH") {
      const id = Number(remMatch[1]);
      if (typeof body.mastered === "boolean") {
        st.masteredMap[id] = body.mastered;
        if (body.mastered) recordActivityDay(st);
      }
      saveState(st);
      return { reminder: getMergedReminders(st).find((r) => r.id === id) };
    }
    if (remMatch && method === "DELETE") {
      const id = Number(remMatch[1]);
      if (!st.deletedReminderIds.includes(id)) st.deletedReminderIds.push(id);
      saveState(st);
      return { deleted: true, id };
    }

    // 7. Mock Exams
    if (path === "/api/mock-exams" && method === "GET") {
      return { exams: (st.mockExams || []).map((e) => e.exam).sort((a, b) => b.id - a.id) };
    }

    if (path === "/api/mock-exams" && method === "POST") {
      const ef = body.exam_filter || "ALL";
      const cnt = Number(body.question_count || 20);
      let pool = getActiveQuestions(st).filter((q) => ef === "ALL" || q.exam_type === ef);
      if (!pool.length) throw new Error("Deneme oluşturmak için havuzda aktif soru yok.");
      // Shuffle
      pool = [...pool].sort(() => Math.random() - 0.5).slice(0, cnt);
      const id = st.nextCustomId++;
      const exam = {
        id,
        title: (body.title || "").trim() || `Haftalık Deneme (${pool.length} Soru)`,
        exam_filter: ef,
        question_count: pool.length,
        status: "in_progress",
        correct_count: 0,
        wrong_count: 0,
        blank_count: 0,
        net_score: 0,
        duration_seconds: 0,
        created_at: nowStr(),
      };
      const items = pool.map((q, idx) => ({
        item_id: st.nextCustomId++,
        question_id: q.id,
        order_index: idx + 1,
        exam_type: q.exam_type,
        subject: q.subject,
        topic: q.topic,
        question_text: q.question_text,
        options: q.options || {},
        svg_markup: q.svg_markup || "",
        image_filename: q.image_filename || "",
        has_answer_key: Boolean(q.correct_answer),
        _key: q.correct_answer || "",
        _solution: q.solution || "",
        correct_answer: "",
        solution: "",
        user_answer: "",
        result: "pending",
      }));
      const record = { exam, items };
      st.mockExams.push(record);
      saveState(st);
      return record;
    }

    const mockDetailMatch = path.match(/^\/api\/mock-exams\/(\d+)$/);
    if (mockDetailMatch && method === "GET") {
      const id = Number(mockDetailMatch[1]);
      const rec = (st.mockExams || []).find((e) => e.exam.id === id);
      if (!rec) throw new Error("Deneme bulunamadı.");
      return rec;
    }

    const mockSubmitMatch = path.match(/^\/api\/mock-exams\/(\d+)\/submit$/);
    if (mockSubmitMatch && method === "POST") {
      const id = Number(mockSubmitMatch[1]);
      const rec = (st.mockExams || []).find((e) => e.exam.id === id);
      if (!rec) throw new Error("Deneme bulunamadı.");
      const ansMap = new Map((body.answers || []).map((a) => [Number(a.item_id), a]));
      let c = 0, w = 0, b = 0;
      for (const it of rec.items) {
        const a = ansMap.get(it.item_id) || {};
        const uAns = (a.user_answer || "").trim().toUpperCase();
        if (it._key) {
          if (!uAns) { it.result = "blank"; b += 1; }
          else if (uAns === it._key) { it.result = "correct"; c += 1; }
          else { it.result = "wrong"; w += 1; }
        } else {
          it.result = a.result || "blank";
          if (it.result === "correct") c += 1;
          else if (it.result === "wrong") w += 1;
          else b += 1;
        }
        it.user_answer = uAns;
        it.correct_answer = it._key;
        it.solution = it._solution;
      }
      rec.exam.status = "completed";
      rec.exam.correct_count = c;
      rec.exam.wrong_count = w;
      rec.exam.blank_count = b;
      rec.exam.net_score = Math.round((c - w * 0.25) * 100) / 100;
      rec.exam.duration_seconds = Number(body.duration_seconds || 0);
      recordActivityDay(st);
      saveState(st);
      return rec;
    }

    throw new Error(`Desteklenmeyen statik istek: ${method} ${path}`);
  };
})();
